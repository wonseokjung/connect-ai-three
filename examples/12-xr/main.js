// A roller coaster you ride in VR: put on a Quest, press Enter VR, and you sit in the front car at sunset.
// On a computer you ride along on screen; C switches between the ride and an overview.
//
// Adapted from the official three.js example webxr_vr_rollercoaster (MIT): the track curve, RollerCoasterGeometry,
// RollerCoasterLiftersGeometry and RollerCoasterShadowGeometry, the gravity-like speed and the banking, VRButton and
// the 'local' reference space. Changes: a sunset Sky with image-based light instead of a flat colour, a seeded
// terrain, and real models instead of the example's coloured cylinders: Kenney Coaster Kit (CC0) cars, station,
// trees and food stalls.
import * as THREE from 'three';
import { RollerCoasterGeometry, RollerCoasterShadowGeometry, RollerCoasterLiftersGeometry } from 'three/addons/misc/RollerCoaster.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType( 'local' );
document.body.appendChild( renderer.domElement );
document.body.appendChild( VRButton.createButton( renderer ) );

const scene = new THREE.Scene();
const sunDir = new THREE.Vector3().setFromSphericalCoords( 1, THREE.MathUtils.degToRad( 82 ), THREE.MathUtils.degToRad( 210 ) );
const sky = new Sky();
sky.scale.setScalar( 2000 );
Object.assign( sky.material.uniforms.turbidity, { value: 5 } );
sky.material.uniforms.rayleigh.value = 2.2;
sky.material.uniforms.mieCoefficient.value = 0.006;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy( sunDir );
scene.add( sky );
const skyScene = new THREE.Scene();
skyScene.add( sky.clone() );
scene.environment = new THREE.PMREMGenerator( renderer ).fromScene( skyScene ).texture;
scene.environmentIntensity = 0.7;
scene.fog = new THREE.Fog( 0xf1b98a, 150, 520 );

const sun = new THREE.DirectionalLight( 0xffcf9a, 3.2 );
sun.position.copy( sunDir ).multiplyScalar( 200 );
sun.castShadow = true;
sun.shadow.mapSize.set( 4096, 4096 );
Object.assign( sun.shadow.camera, { left: - 130, right: 130, top: 130, bottom: - 130, near: 10, far: 500 } );
sun.shadow.bias = - 0.0005;
scene.add( sun );

let seed = 3;
const rand = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );

// ---------- terrain: flat in the park, hills further out (as in the example, but seeded) ----------
const ground = new THREE.PlaneGeometry( 800, 800, 60, 60 );
ground.rotateX( - Math.PI / 2 );
const pos = ground.attributes.position, v = new THREE.Vector3(), colors = [];
const grassA = new THREE.Color( 0x5d8a2f ), grassB = new THREE.Color( 0x87a83a ), c = new THREE.Color();
for ( let i = 0; i < pos.count; i ++ ) {

	v.fromBufferAttribute( pos, i );
	v.x += rand() * 8 - 4;
	v.z += rand() * 8 - 4;
	const d = v.length() / 5 - 26;
	v.y = rand() * Math.max( 0, d ) * 0.9;
	pos.setXYZ( i, v.x, v.y, v.z );
	c.copy( grassA ).lerp( grassB, rand() );
	colors.push( c.r, c.g, c.b );

}
ground.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
ground.computeVertexNormals();
const groundMesh = new THREE.Mesh( ground, new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.95, flatShading: true } ) );
groundMesh.receiveShadow = true;
scene.add( groundMesh );

// ---------- the track (webxr_vr_rollercoaster) ----------
const curve = {
	p: new THREE.Vector3(), q: new THREE.Vector3(),
	getPointAt( t ) {

		t *= Math.PI * 2;
		return this.p.set( Math.sin( t * 3 ) * Math.cos( t * 4 ) * 50, Math.sin( t * 10 ) * 2 + Math.cos( t * 17 ) * 2 + 5, Math.sin( t ) * Math.sin( t * 4 ) * 50 ).multiplyScalar( 2 );

	},
	getTangentAt( t ) {

		const d = 0.0001;
		return this.q.copy( this.getPointAt( Math.min( 1, t + d ) ) ).sub( this.getPointAt( Math.max( 0, t - d ) ) ).normalize();

	},
};
const track = new THREE.Mesh( new RollerCoasterGeometry( curve, 1500 ), new THREE.MeshStandardMaterial( { vertexColors: true, metalness: 0.5, roughness: 0.35 } ) );
track.castShadow = true;
scene.add( track );
const lifters = new THREE.Mesh( new RollerCoasterLiftersGeometry( curve, 100 ), new THREE.MeshStandardMaterial( { color: 0xe94f37, metalness: 0.4, roughness: 0.4 } ) );
lifters.position.y = 0.1;
lifters.castShadow = true;
scene.add( lifters );
const shadow = new THREE.Mesh( new RollerCoasterShadowGeometry( curve, 500 ), new THREE.MeshBasicMaterial( { color: 0x2e4a14, depthWrite: false, transparent: true, opacity: 0.5 } ) );
shadow.position.y = 0.1;
scene.add( shadow );

// ---------- the park: Kenney Coaster Kit models (CC0) ----------
const loader = new GLTFLoader();
const load = async ( f ) => {

	const g = ( await loader.loadAsync( 'assets/' + f + '.glb' ) ).scene;
	g.traverse( ( o ) => o.isMesh && ( o.castShadow = o.receiveShadow = true ) );
	return g;

};
const [ carFront, car, tree, treeLarge, food, drinks, station, flowers ] = await Promise.all(
	[ 'coaster-train-front', 'coaster-train', 'tree', 'tree-large', 'stall-food', 'stall-drinks', 'station', 'flowers' ].map( load ) );
const near = ( x, z ) => {

	for ( let k = 0; k < 400; k ++ ) {

		const p = curve.getPointAt( k / 400 );
		if ( Math.hypot( p.x - x, p.z - z ) < 9 ) return true;

	}
	return false;

};
for ( let i = 0; i < 170; i ++ ) {

	const x = ( rand() - 0.5 ) * 300, z = ( rand() - 0.5 ) * 300;
	if ( near( x, z ) ) continue;
	const t = ( rand() < 0.4 ? treeLarge : tree ).clone();
	t.position.set( x, 0, z );
	t.rotation.y = rand() * 6.28;
	t.scale.setScalar( 5 + rand() * 4 );
	scene.add( t );

}
for ( let i = 0; i < 60; i ++ ) {

	const x = ( rand() - 0.5 ) * 200, z = ( rand() - 0.5 ) * 200;
	if ( near( x, z ) ) continue;
	const f = flowers.clone();
	f.position.set( x, 0, z );
	f.scale.setScalar( 4 );
	scene.add( f );

}
for ( const [ m, x, z, r ] of [ [ food, 18, 62, 0.4 ], [ drinks, 30, 58, 0.1 ], [ food, - 60, - 20, 2 ], [ drinks, - 52, - 30, 2.4 ], [ station, 4, 74, 0 ] ] ) {

	const o = m.clone();
	o.position.set( x, 0, z );
	o.rotation.y = r;
	o.scale.setScalar( 6 );
	scene.add( o );

}

// ---------- the train: three cars that follow the track, you sit in the front one ----------
const cars = [ carFront, car.clone(), car ].map( ( m ) => {

	const holder = new THREE.Group();
	const inner = m.clone();
	inner.scale.setScalar( 1.6 );
	holder.add( inner );
	scene.add( holder );
	return holder;

} );
const rider = new THREE.Group();
scene.add( rider );
const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.1, 1200 );
rider.add( camera );
camera.position.set( 0, 1.25, 0.25 );
const overview = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
overview.position.set( 150, 90, 170 );
overview.lookAt( 0, 0, 0 );
// on a computer: a tour (8 s riding, 5 s looking at the whole park) until you press C to pick one
let view = 'tour';
addEventListener( 'keydown', ( e ) => e.code === 'KeyC' && ( view = view === 'ride' ? 'overview' : 'ride' ) );
addEventListener( 'resize', () => {

	for ( const cam of [ camera, overview ] ) {

		cam.aspect = innerWidth / innerHeight;
		cam.updateProjectionMatrix();

	}
	renderer.setSize( innerWidth, innerHeight );

} );

const position = new THREE.Vector3(), tangent = new THREE.Vector3(), lookAt = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), bankQ = new THREE.Quaternion();
let velocity = 0, progress = 0.08;
function place( obj, p ) {

	position.copy( curve.getPointAt( p ) );
	position.y += 0.3;
	obj.position.copy( position );
	tangent.copy( curve.getTangentAt( p ) );
	// banking, as in the example
	const d = 0.01;
	t1.copy( curve.getTangentAt( ( ( p - d ) % 1 + 1 ) % 1 ) );
	t2.copy( curve.getTangentAt( ( p + d ) % 1 ) );
	let turn = Math.atan2( t2.x, t2.z ) - Math.atan2( t1.x, t1.z );
	if ( turn > Math.PI ) turn -= Math.PI * 2;
	if ( turn < - Math.PI ) turn += Math.PI * 2;
	obj.up.set( 0, 1, 0 );
	bankQ.setFromAxisAngle( tangent, - Math.atan( turn * 8 ) * 0.5 );
	obj.up.applyQuaternion( bankQ );
	obj.lookAt( lookAt.copy( position ).sub( tangent ) );

}

const timer = new THREE.Timer();
timer.connect( document );
let t0 = - 1;
window.RESTART = () => ( t0 = - 1 );
renderer.setAnimationLoop( () => {

	timer.update();
	const delta = Math.min( timer.getDelta(), 0.05 ) * 1000;
	progress = ( progress + velocity * delta / 16.67 ) % 1;
	tangent.copy( curve.getTangentAt( progress ) );
	velocity -= tangent.y * 0.0000001 * delta;
	velocity = Math.max( 0.00004, Math.min( 0.0002, velocity ) );
	place( rider, progress );
	cars.forEach( ( car, i ) => place( car, ( progress - i * 0.0042 + 1 ) % 1 ) );
	if ( t0 < 0 ) t0 = timer.getElapsed();
	const t = timer.getElapsed() - t0;
	const showRide = renderer.xr.isPresenting || view === 'ride' || ( view === 'tour' && t % 13 < 8 );
	if ( ! showRide ) {

		const a = 0.75 + t * 0.05;
		overview.position.set( Math.sin( a ) * 115, 48, Math.cos( a ) * 115 );
		overview.lookAt( 0, 2, 0 );

	}
	renderer.render( scene, showRide ? camera : overview );

} );
window.EXAMPLE = { renderer, scene, camera, ready: true };
