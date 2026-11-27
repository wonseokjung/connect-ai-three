// A flight game over a sunset sea: fly a jet through golden rings. Arrow keys or WASD steer, Shift boosts.
// Leave the keys alone and the autopilot flies the rings for you.
//
// Adapted from the official three.js example webgl_shaders_ocean (MIT): the Water and Sky objects, the sun direction
// shared by both, and the sky turned into scene lighting with PMREMGenerator. Changes: the water normal map is drawn
// in code (the example's waternormals.jpg is not used), the camera chases a jet, and the game (rings, score,
// autopilot) is new. Models, all CC0: "Spaceship" by Quaternius (the jet), Kenney Nature Kit rocks (sea stacks).
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 20000 );

// ---------- sun, sky, sea (webgl_shaders_ocean) ----------
const sun = new THREE.Vector3().setFromSphericalCoords( 1, THREE.MathUtils.degToRad( 88.5 ), THREE.MathUtils.degToRad( 180 ) );
const sky = new Sky();
sky.scale.setScalar( 10000 );
const su = sky.material.uniforms;
su.turbidity.value = 6;
su.rayleigh.value = 3.2;
su.mieCoefficient.value = 0.005;
su.mieDirectionalG.value = 0.85;
su.sunPosition.value.copy( sun );
scene.add( sky );

// the water normal map, drawn in code: a few sine waves with whole-number frequencies, so it tiles
function waterNormals( size = 256 ) {

	const h = new Float32Array( size * size );
	// 40 small waves in every direction, whole-number frequencies so the tile repeats seamlessly
	let q = 7;
	const rq = () => ( ( q = ( q * 16807 ) % 2147483647 ) / 2147483647 );
	const waves = Array.from( { length: 40 }, () => {

		const a = rq() * Math.PI * 2, f = 4 + rq() * 26;
		return [ Math.round( Math.cos( a ) * f ), Math.round( Math.sin( a ) * f ), 1 / f ];

	} );
	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

		let v = 0;
		for ( const [ fx, fy, a ] of waves ) v += a * Math.sin( 2 * Math.PI * ( fx * x + fy * y ) / size + fx * 1.7 );
		h[ y * size + x ] = v;

	}
	const data = new Uint8Array( size * size * 4 );
	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

		const dx = h[ y * size + ( ( x + 1 ) % size ) ] - h[ y * size + ( ( x + size - 1 ) % size ) ];
		const dy = h[ ( ( y + 1 ) % size ) * size + x ] - h[ ( ( y + size - 1 ) % size ) * size + x ];
		const n = new THREE.Vector3( - dx * 4, - dy * 4, 1 ).normalize();
		const i = ( y * size + x ) * 4;
		data[ i ] = ( n.x * 0.5 + 0.5 ) * 255; data[ i + 1 ] = ( n.y * 0.5 + 0.5 ) * 255; data[ i + 2 ] = ( n.z * 0.5 + 0.5 ) * 255; data[ i + 3 ] = 255;

	}
	const t = new THREE.DataTexture( data, size, size );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.magFilter = THREE.LinearFilter;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;

}
const water = new Water( new THREE.PlaneGeometry( 20000, 20000 ), {
	textureWidth: 512, textureHeight: 512, waterNormals: waterNormals(), sunDirection: sun.clone(), sunColor: 0xffe0b0, waterColor: 0x0a2a3a, distortionScale: 2.2, fog: false,
} );
water.rotation.x = - Math.PI / 2;
scene.add( water );

// light the scene with the sky, like the example
const pmrem = new THREE.PMREMGenerator( renderer );
const skyScene = new THREE.Scene();
skyScene.add( sky.clone() );
scene.environment = pmrem.fromScene( skyScene ).texture;
const sunLight = new THREE.DirectionalLight( 0xffc890, 3 );
sunLight.position.copy( sun ).multiplyScalar( 100 );
// a soft fill from behind the camera, so the jet is not only a silhouette against the sun
const fill = new THREE.DirectionalLight( 0xffd8c0, 1.6 );
fill.position.set( 0.3, 0.6, 1 );
scene.add( sunLight, fill, new THREE.HemisphereLight( 0xffd2b0, 0x1a3040, 0.6 ) );
scene.fog = new THREE.Fog( 0xe8a884, 1500, 6000 );

// ---------- the jet ----------
const loader = new GLTFLoader();
const jetModel = ( await loader.loadAsync( 'assets/jet.glb' ) ).scene;
jetModel.traverse( ( o ) => {

	if ( o.isMesh ) o.material = o.material.name === 'Black'
		? new THREE.MeshPhysicalMaterial( { color: 0x0b0d12, metalness: 0.2, roughness: 0.1, clearcoat: 1 } ) // the canopy
		: new THREE.MeshPhysicalMaterial( { color: 0xf3efe8, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 } );

} );
// the model lies flat in its file (nose along +y, top along +z): stand it up so it flies along -z
jetModel.rotation.x = - Math.PI / 2;
const jetFix = new THREE.Group();
jetFix.add( jetModel );
const box = new THREE.Box3().setFromObject( jetFix );
const size = box.getSize( new THREE.Vector3() );
jetFix.scale.setScalar( 14 / Math.max( size.x, size.y, size.z ) );
box.setFromObject( jetFix );
jetFix.position.sub( box.getCenter( new THREE.Vector3() ) );
const jet = new THREE.Group();
const bank = new THREE.Group();
bank.add( jetFix );
jet.add( bank );
// engine glow: a hot additive sprite at the tail
const glowTex = ( () => {

	const c = document.createElement( 'canvas' );
	c.width = c.height = 64;
	const g = c.getContext( '2d' ), r = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	r.addColorStop( 0, 'rgba(255,255,255,1)' ); r.addColorStop( 0.25, 'rgba(255,190,90,0.9)' ); r.addColorStop( 1, 'rgba(255,90,20,0)' );
	g.fillStyle = r; g.fillRect( 0, 0, 64, 64 );
	return new THREE.CanvasTexture( c );

} )();
const flame = new THREE.Sprite( new THREE.SpriteMaterial( { map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false } ) );
flame.position.set( 0, 0.2, 7.2 );
flame.scale.setScalar( 5 );
bank.add( flame );
scene.add( jet );
jet.position.set( 0, 60, 300 );

// ---------- sea stacks (Kenney Nature Kit rocks, scaled up) ----------
const rockModels = await Promise.all( [ 'rock_tallA.glb', 'rock_largeA.glb' ].map( ( f ) => loader.loadAsync( 'assets/' + f ) ) );
let seed = 5;
const rand = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );
const rocks = [];
for ( let i = 0; i < 26; i ++ ) {

	const r = rockModels[ i % 2 ].scene.clone();
	r.traverse( ( o ) => o.isMesh && ( o.material = new THREE.MeshStandardMaterial( { color: 0x6b5a54, roughness: 0.9, flatShading: true } ) ) );
	const s = 40 + rand() * 70;
	r.scale.set( s, s * ( 0.8 + rand() * 1.6 ), s );
	r.rotation.y = rand() * 6.28;
	r.position.set( ( rand() < 0.5 ? - 1 : 1 ) * ( 160 + rand() * 600 ), - 4, - i * 260 + rand() * 100 );
	scene.add( r );
	rocks.push( r );

}

// ---------- clouds: soft sprites lit by the sunset ----------
const puff = ( () => {

	const c = document.createElement( 'canvas' );
	c.width = c.height = 128;
	const g = c.getContext( '2d' );
	for ( let i = 0; i < 26; i ++ ) {

		const x = 30 + rand() * 68, y = 44 + rand() * 40, rr = 14 + rand() * 22, r = g.createRadialGradient( x, y, 0, x, y, rr );
		r.addColorStop( 0, 'rgba(255,255,255,0.55)' ); r.addColorStop( 1, 'rgba(255,255,255,0)' );
		g.fillStyle = r; g.fillRect( 0, 0, 128, 128 );

	}
	return new THREE.CanvasTexture( c );

} )();
const clouds = [];
for ( let i = 0; i < 70; i ++ ) {

	const sp = new THREE.Sprite( new THREE.SpriteMaterial( { map: puff, color: new THREE.Color().setHSL( 0.97 + rand() * 0.08, 0.85, 0.72 + rand() * 0.1 ), transparent: true, depthWrite: false, fog: true } ) );
	const s = 180 + rand() * 360;
	sp.scale.set( s * 1.8, s, 1 );
	sp.position.set( ( rand() - 0.5 ) * 3000, 140 + rand() * 260, - rand() * 6000 );
	scene.add( sp );
	clouds.push( sp );

}

// ---------- rings ----------
const ringGeo = new THREE.TorusGeometry( 16, 1.6, 20, 64 );
const ringMat = () => new THREE.MeshStandardMaterial( { color: 0xffc04a, emissive: 0xff9a1a, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.25 } );
const rings = [];
let nextIndex = 0;
const ringPos = ( i ) => new THREE.Vector3( Math.sin( i * 0.75 ) * 70 + Math.sin( i * 0.31 ) * 40, 55 + Math.sin( i * 1.3 ) * 22, - i * 170 );
for ( let i = 0; i < 14; i ++ ) {

	const m = new THREE.Mesh( ringGeo, ringMat() );
	m.position.copy( ringPos( i ) );
	m.userData = { i, flash: 0 };
	scene.add( m );
	rings.push( m );

}

// ---------- input ----------
const keys = {};
let lastKey = - 1;
addEventListener( 'keydown', ( e ) => {

	keys[ e.code ] = true;
	lastKey = performance.now();

} );
addEventListener( 'keyup', ( e ) => ( keys[ e.code ] = false ) );
addEventListener( 'resize', () => {

	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( innerWidth, innerHeight );

} );

// ---------- flight ----------
let yaw = 0, pitch = 0, roll = 0, score = 0;
const scoreEl = document.getElementById( 'score' ), modeEl = document.getElementById( 'mode' );
const fwd = new THREE.Vector3(), camGoal = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
const timer = new THREE.Timer();
timer.connect( document );
camera.position.set( 0, 75, 345 );

function animate() {

	timer.update();
	const dt = Math.min( timer.getDelta(), 0.05 ), t = timer.getElapsed();
	const manual = performance.now() - lastKey < 6000;
	modeEl.textContent = manual ? 'MANUAL' : 'AUTOPILOT';
	let turn = 0, climb = 0;
	if ( manual ) {

		turn = ( keys.ArrowLeft || keys.KeyA ? 1 : 0 ) - ( keys.ArrowRight || keys.KeyD ? 1 : 0 );
		climb = ( keys.ArrowUp || keys.KeyW ? 1 : 0 ) - ( keys.ArrowDown || keys.KeyS ? 1 : 0 );

	} else {

		// autopilot: steer toward the next ring
		const target = rings.find( ( r ) => r.userData.i === nextIndex ).position;
		tmp.copy( target ).sub( jet.position );
		const wantYaw = Math.atan2( - tmp.x, - tmp.z ), wantPitch = Math.atan2( tmp.y, Math.hypot( tmp.x, tmp.z ) );
		turn = THREE.MathUtils.clamp( ( wantYaw - yaw ) * 2.2, - 1, 1 );
		climb = THREE.MathUtils.clamp( ( wantPitch - pitch ) * 3, - 1, 1 );

	}
	yaw += turn * 1.1 * dt;
	pitch = THREE.MathUtils.clamp( pitch + climb * 0.9 * dt, - 0.5, 0.5 );
	pitch *= 1 - 0.6 * dt * ( climb === 0 ? 1 : 0 );
	roll += ( turn * 0.75 - roll ) * Math.min( 1, dt * 4 );
	const speed = keys.ShiftLeft || keys.ShiftRight ? 150 : 95;
	jet.rotation.set( pitch, yaw, 0, 'YXZ' );
	bank.rotation.z = roll;
	fwd.set( 0, 0, - 1 ).applyEuler( jet.rotation );
	jet.position.addScaledVector( fwd, speed * dt );
	jet.position.y = Math.max( 12, jet.position.y );
	flame.scale.setScalar( 4.5 + Math.sin( t * 40 ) * 0.6 + ( speed > 100 ? 2 : 0 ) );

	// rings: pass through one -> score, flash, and it moves to the end of the line
	for ( const r of rings ) {

		const d = tmp.copy( jet.position ).sub( r.position );
		if ( r.userData.i === nextIndex && Math.abs( d.z ) < 4 && Math.hypot( d.x, d.y ) < 16 ) {

			score ++;
			r.userData.flash = 1;
			nextIndex ++;

		} else if ( r.userData.i === nextIndex && d.z < - 30 ) nextIndex ++; // missed it
		if ( r.position.z - jet.position.z > 120 && r.userData.flash <= 0.01 ) {

			r.userData.i += rings.length;
			r.position.copy( ringPos( r.userData.i ) );

		}
		r.userData.flash *= 1 - dt * 2.5;
		r.material.emissiveIntensity = 1.6 + r.userData.flash * 8;
		r.scale.setScalar( 1 + r.userData.flash * 0.35 );
		r.rotation.z += dt * 0.4;

	}
	scoreEl.textContent = score;
	// recycle rocks and clouds that fall behind
	for ( const o of [ ...rocks, ...clouds ] ) if ( o.position.z - jet.position.z > 400 ) o.position.z -= 6400;

	// chase camera
	camGoal.set( 0, 5.5, 23 ).applyEuler( new THREE.Euler( pitch * 0.5, yaw, 0, 'YXZ' ) ).add( jet.position );
	camera.position.lerp( camGoal, Math.min( 1, dt * 3 ) );
	look.copy( fwd ).multiplyScalar( 60 ).add( jet.position ).add( tmp.set( 0, 3, 0 ) );
	camera.lookAt( look );
	camera.rotateZ( - roll * 0.25 );
	// sky and sea follow the jet
	sky.position.copy( camera.position );
	water.position.x = jet.position.x;
	water.position.z = jet.position.z;
	water.material.uniforms.time.value = t * 0.6;
	renderer.render( scene, camera );

}
renderer.setAnimationLoop( animate );
window.EXAMPLE = { renderer, scene, camera, ready: true };
