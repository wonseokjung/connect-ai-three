// Real physics: big 3D letters drop onto the floor and bounce, then candy coloured balls and blocks pour down on them
// and keep pouring (each one that falls off is put back on top). Double-click to shake everything up.
//
// Adapted from the official three.js example physics_rapier_instancing (MIT): instanced boxes and spheres in a Rapier
// world, recycled from the top, an impulse "shake". Rapier itself is @dimforge/rapier3d-compat (Apache-2.0).
// Changes: the world steps once per frame with a fixed 1/60 s (so a recording is the same every time), the letters
// are convex-hull bodies built from TextGeometry, and the look is a bright studio instead of grey.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const WORD = 'PLAY';

await RAPIER.init();
const world = new RAPIER.World( { x: 0, y: - 9.81, z: 0 } );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xffd9c2 );
scene.fog = new THREE.Fog( 0xffd9c2, 14, 30 );
scene.environment = new THREE.PMREMGenerator( renderer ).fromScene( new RoomEnvironment(), 0.04 ).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera( 38, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.set( - 3.2, 6.2, 10.5 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0, 0.9, 0 );
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const sun = new THREE.DirectionalLight( 0xffffff, 2.6 );
sun.position.set( 4, 9, 5 );
sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
Object.assign( sun.shadow.camera, { left: - 7, right: 7, top: 7, bottom: - 7, near: 1, far: 30 } );
sun.shadow.radius = 4;
scene.add( sun, new THREE.HemisphereLight( 0xfff1e6, 0xb0573c, 0.45 ) );

// the floor: a fixed body, and a soft coloured plate that catches shadows
const floor = new THREE.Mesh( new THREE.CylinderGeometry( 6, 6.2, 0.4, 96 ), new THREE.MeshStandardMaterial( { color: 0xf08a68, roughness: 0.7 } ) );
floor.position.y = - 0.2;
floor.receiveShadow = true;
scene.add( floor );
world.createCollider( RAPIER.ColliderDesc.cylinder( 0.2, 6 ).setTranslation( 0, - 0.2, 0 ).setRestitution( 0.3 ).setFriction( 0.8 ) );
const ground = new THREE.Mesh( new THREE.PlaneGeometry( 80, 80 ), new THREE.ShadowMaterial( { color: 0xc06d50, opacity: 0.25 } ) );
ground.rotation.x = - Math.PI / 2;
ground.position.y = - 0.41;
ground.receiveShadow = true;
scene.add( ground );

let seed = 11;
const rand = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );

// ---------- the letters: one rigid body each, collider = convex hull of the glyph ----------
const font = await new FontLoader().loadAsync( 'assets/bold.typeface.json' );
const letterColors = [ 0xff2d5f, 0x2f6bff, 0xffb000, 0x10b38a, 0x8a3dff ];
const letters = [];
{

	const size = 1.35, scale = size / font.data.resolution;
	let width = 0;
	for ( const ch of WORD ) width += font.data.glyphs[ ch ].ha * scale;
	let x = - width / 2;
	[ ...WORD ].forEach( ( ch, i ) => {

		const geo = new TextGeometry( ch, { font, size, depth: 0.75, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 3 } );
		geo.computeBoundingBox();
		const c = geo.boundingBox.getCenter( new THREE.Vector3() );
		geo.translate( - c.x, - c.y, - c.z );
		const mesh = new THREE.Mesh( geo, new THREE.MeshPhysicalMaterial( { color: letterColors[ i % letterColors.length ], roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 } ) );
		mesh.castShadow = mesh.receiveShadow = true;
		scene.add( mesh );
		const body = world.createRigidBody( RAPIER.RigidBodyDesc.dynamic().setTranslation( x + c.x, 4.5 + i * 1.1, 0 ).setRotation( new THREE.Quaternion().setFromEuler( new THREE.Euler( 0.15 * ( i % 2 ? 1 : - 1 ), 0, 0.12 * ( i - 1.5 ) ) ) ) );
		const pts = geo.getAttribute( 'position' ).array;
		world.createCollider( RAPIER.ColliderDesc.convexHull( new Float32Array( pts ) ).setRestitution( 0.35 ).setFriction( 0.7 ).setDensity( 1.2 ), body );
		letters.push( { mesh, body, home: x + c.x } );
		x += font.data.glyphs[ ch ].ha * scale;

	} );

}

// ---------- the pour: instanced balls and rounded blocks, as in physics_rapier_instancing ----------
const candy = [ 0xff3d6e, 0xffb31a, 0x14b8a6, 0x3b6cff, 0x9b51ff, 0xffffff, 0xff7a2f ];
function instanced( geometry, count, colliderOf, startAt ) {

	const mesh = new THREE.InstancedMesh( geometry, new THREE.MeshPhysicalMaterial( { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 } ), count );
	mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
	mesh.castShadow = mesh.receiveShadow = true;
	mesh.frustumCulled = false; // the bodies start high up; the bounding sphere from frame one would hide them later
	const bodies = [];
	const color = new THREE.Color();
	for ( let i = 0; i < count; i ++ ) {

		const p = { x: ( rand() - 0.5 ) * 2.4, y: 7 + startAt + i * 0.045, z: ( rand() - 0.5 ) * 1.6 };
		const body = world.createRigidBody( RAPIER.RigidBodyDesc.dynamic().setTranslation( p.x, p.y, p.z ).setCanSleep( false ) );
		world.createCollider( colliderOf().setRestitution( 0.4 ).setFriction( 0.6 ), body );
		bodies.push( body );
		mesh.setColorAt( i, color.setHex( candy[ Math.floor( rand() * candy.length ) ] ) );

	}
	scene.add( mesh );
	return { mesh, bodies };

}
const R = 0.13;
const balls = instanced( new THREE.IcosahedronGeometry( R, 4 ), 360, () => RAPIER.ColliderDesc.ball( R ), 2.0 );
const blocks = instanced( new RoundedBoxGeometry( 0.24, 0.24, 0.24, 3, 0.05 ), 240, () => RAPIER.ColliderDesc.roundCuboid( 0.07, 0.07, 0.07, 0.05 ), 4.0 );

// ---------- shake: an upward kick for everything (the official example's button) ----------
function shake() {

	for ( const group of [ balls, blocks ] ) for ( const b of group.bodies ) b.applyImpulse( { x: ( rand() - 0.5 ) * 0.08, y: rand() * 0.12, z: ( rand() - 0.5 ) * 0.08 }, true );
	for ( const L of letters ) {

		const m = L.body.mass();
		L.body.applyImpulse( { x: ( rand() - 0.5 ) * 0.6 * m, y: ( 4.5 + rand() * 1.5 ) * m, z: ( rand() - 0.5 ) * 0.4 * m }, true );
		L.body.applyTorqueImpulse( { x: ( rand() - 0.5 ) * 0.3 * m, y: ( rand() - 0.5 ) * 0.3 * m, z: ( rand() - 0.5 ) * 0.3 * m }, true );

	}

}
renderer.domElement.addEventListener( 'dblclick', shake );

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

} );

// ---------- step once per frame, copy bodies to meshes ----------
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3( 1, 1, 1 );
let frame = 0;
let userMoved = false;
controls.addEventListener( 'start', () => ( userMoved = true ) );
function animate() {

	world.timestep = 1 / 60;
	world.step();
	world.step(); // two steps per drawn frame keep it lively at 30 fps recordings and smooth at 60
	frame ++;
	for ( const L of letters ) {

		let t = L.body.translation();
		if ( t.y < - 3 ) {

			// a letter that falls off comes back from the top
			L.body.setTranslation( { x: L.home, y: 6, z: 0 }, true );
			L.body.setLinvel( { x: 0, y: 0, z: 0 }, true );
			L.body.setAngvel( { x: 0, y: 0, z: 0 }, true );
			t = L.body.translation();

		}
		const r = L.body.rotation();
		L.mesh.position.set( t.x, t.y, t.z );
		L.mesh.quaternion.set( r.x, r.y, r.z, r.w );

	}
	for ( const group of [ balls, blocks ] ) {

		group.bodies.forEach( ( b, i ) => {

			let t = b.translation();
			if ( t.y < - 3 ) {

				// fell off the plate: drop it in again from the top, like the official example
				b.setTranslation( { x: ( rand() - 0.5 ) * 1.2, y: 6 + rand() * 2, z: ( rand() - 0.5 ) * 0.8 }, true );
				b.setLinvel( { x: 0, y: 0, z: 0 }, true );
				t = b.translation();

			}
			const r = b.rotation();
			m.compose( v.set( t.x, t.y, t.z ), q.set( r.x, r.y, r.z, r.w ), one );
			group.mesh.setMatrixAt( i, m );

		} );
		group.mesh.instanceMatrix.needsUpdate = true;

	}
	if ( frame === 200 ) shake(); // one shake on its own, so you see what a click does
	if ( ! userMoved ) {

		const a = - 0.3 + frame * 0.0012;
		camera.position.set( Math.sin( a ) * 10.2, 5.6, Math.cos( a ) * 10.2 );

	}
	controls.update();
	renderer.render( scene, camera );

}
renderer.setAnimationLoop( animate );
window.EXAMPLE = { renderer, scene, camera, ready: true };
