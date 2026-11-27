// Miniature world: a small hex island village that slowly turns, with a windmill, a water wheel and a saw that run on
// keyframe animation clips, and clouds that drift.
//
// Adapted from the official three.js example webgl_animation_keyframes (MIT, mrdoob/three.js): Sky + PMREM environment,
// GLTFLoader, AnimationMixer, OrbitControls, Timer. That example uses the Littlest Tokyo model (CC BY); here the world
// is built from KayKit Medieval Hexagon Pack pieces (CC0, Kay Lousberg) and every moving part gets its own clip.
// Added: a sun with soft shadows and a tilt-shift pass (three.js addons) for the miniature look.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

const timer = new THREE.Timer();
timer.connect( document );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();

// sky and image-based light, as in the official example (late afternoon sun)
const sky = new Sky();
sky.scale.setScalar( 10000 );
scene.add( sky );
const u = sky.material.uniforms;
u.turbidity.value = 6;
u.rayleigh.value = 1.6;
u.mieCoefficient.value = 0.004;
u.mieDirectionalG.value = 0.8;
const sunDir = new THREE.Vector3().setFromSphericalCoords( 1, THREE.MathUtils.degToRad( 90 - 24 ), THREE.MathUtils.degToRad( 210 ) );
u.sunPosition.value.copy( sunDir );
const pmrem = new THREE.PMREMGenerator( renderer );
scene.environment = pmrem.fromScene( sky ).texture;
scene.environmentIntensity = 0.5;
scene.fog = new THREE.Fog( 0x8dbbe0, 40, 120 );

const sun = new THREE.DirectionalLight( 0xffe2b8, 3.4 );
sun.position.copy( sunDir ).multiplyScalar( 30 );
sun.castShadow = true;
sun.shadow.mapSize.set( 4096, 4096 );
Object.assign( sun.shadow.camera, { left: - 16, right: 16, top: 16, bottom: - 16, near: 1, far: 80 } );
sun.shadow.bias = - 0.0004;
sun.shadow.normalBias = 0.02;
scene.add( sun );
scene.add( new THREE.HemisphereLight( 0xbfdcff, 0x4a5a30, 0.15 ) );

// open sea all the way to the horizon, under the water tiles
const sea = new THREE.Mesh( new THREE.CircleGeometry( 400, 96 ), new THREE.MeshStandardMaterial( { color: 0x2a86c4, roughness: 0.55, metalness: 0.0 } ) );
sea.rotation.x = - Math.PI / 2;
sea.position.y = - 0.32;
sea.receiveShadow = true;
scene.add( sea );

const camera = new THREE.PerspectiveCamera( 32, window.innerWidth / window.innerHeight, 0.5, 300 );
camera.position.set( 12.5, 8, 14.5 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.target.set( 0, 1.2, 0 );
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 8;
controls.maxDistance = 45;
controls.update();

// --- the island: hex tiles in axial coordinates (pointy top, 2 units across) ---
const HEX = ( q, r ) => new THREE.Vector3( 2 * ( q + r / 2 ), 0, Math.sqrt( 3 ) * r );
const dist = ( q, r ) => ( Math.abs( q ) + Math.abs( r ) + Math.abs( q + r ) ) / 2;
let seed = 7;
const rand = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );

const loader = new GLTFLoader().setPath( 'assets/' );
const cache = new Map();
const load = ( name ) => {

	if ( ! cache.has( name ) ) cache.set( name, loader.loadAsync( name + '.gltf' ) );
	return cache.get( name );

};

const world = new THREE.Group();
scene.add( world );

async function place( name, q, r, { rot = 0, y = 0, scale = 1, jitter = 0 } = {} ) {

	const gltf = await load( name );
	const obj = gltf.scene.clone( true );
	const p = HEX( q, r );
	obj.position.set( p.x + ( rand() - 0.5 ) * jitter, y, p.z + ( rand() - 0.5 ) * jitter );
	obj.rotation.y = rot;
	obj.scale.setScalar( scale );
	obj.traverse( ( o ) => {

		if ( o.isMesh ) {

			o.castShadow = true;
			o.receiveShadow = true;

		}

	} );
	world.add( obj );
	return obj;

}

const LAND = 3, SEA = 7;
const buildings = {
	'0,0': 'building_castle_blue', '2,-2': 'building_church_red', '-1,2': 'building_tavern_yellow', '1,1': 'building_market_red',
	'-3,1': 'building_windmill_blue', '3,-3': 'building_watermill_blue', '-2,3': 'building_lumbermill_green', '1,-1': 'building_well_blue',
	'-1,0': 'building_home_A_blue', '2,0': 'building_home_B_red', '0,2': 'building_home_A_yellow', '-2,1': 'building_home_B_green',
	'1,-2': 'building_home_A_yellow', '3,-1': 'building_blacksmith_yellow', '-1,-1': 'building_grain', '0,-3': 'building_tower_A_blue',
	'-3,3': 'building_grain', '2,1': 'building_home_A_blue',
};
const nature = {
	'-2,-1': 'mountain_A_grass_trees', '-3,0': 'mountain_B_grass', '-2,0': 'hills_A_trees', '-1,-2': 'trees_A_large', '0,-2': 'trees_B_large',
	'-3,2': 'trees_A_medium', '-1,3': 'trees_B_medium', '1,2': 'hills_B', '3,0': 'trees_A_medium', '2,-3': 'trees_B_large', '-1,-1x': 'tree_single_A',
	'1,-3': 'hills_A_trees', '0,3': 'trees_A_large', '3,-2': 'tree_single_A', '-2,2': 'trees_B_medium',
};

async function build() {

	const jobs = [];
	for ( let q = - SEA; q <= SEA; q ++ ) for ( let r = - SEA; r <= SEA; r ++ ) {

		const d = dist( q, r );
		if ( d > SEA ) continue;
		const key = q + ',' + r;
		const land = d <= LAND || ( d === LAND + 1 && rand() < 0.28 && ! ( q === 3 && r === - 3 ) );
		if ( land ) {

			jobs.push( place( 'hex_grass', q, r ) );
			if ( buildings[ key ] ) jobs.push( place( buildings[ key ], q, r, { rot: Math.floor( rand() * 6 ) * Math.PI / 3 } ) );
			else if ( nature[ key ] ) jobs.push( place( nature[ key ], q, r, { rot: Math.floor( rand() * 6 ) * Math.PI / 3 } ) );
			else if ( d === LAND + 1 ) jobs.push( place( rand() < 0.5 ? 'rock_single_A' : 'tree_single_A', q, r, { rot: rand() * 6, jitter: 0.8 } ) );

		} else {

			jobs.push( place( 'hex_water', q, r ) );
			if ( d <= LAND + 2 && rand() < 0.12 ) jobs.push( place( 'waterlily_A', q, r, { y: - 0.2, rot: rand() * 6 } ) );

		}

	}
	// a few props in the village
	jobs.push( place( 'tent', 2, - 1, { rot: 0.6, scale: 0.9, y: 0, jitter: 0 } ).then( ( o ) => o.position.add( new THREE.Vector3( 0.35, 0, 0.45 ) ) ) );
	jobs.push( place( 'flag_red', 0, 0, { rot: 0.3 } ).then( ( o ) => o.position.add( new THREE.Vector3( 0.8, 0, 0.75 ) ) ) );
	jobs.push( place( 'barrel', 1, 1, { rot: 1 } ).then( ( o ) => o.position.add( new THREE.Vector3( - 0.7, 0, 0.6 ) ) ) );
	jobs.push( place( 'crate_A_big', - 1, 2, { rot: 2 } ).then( ( o ) => o.position.add( new THREE.Vector3( 0.75, 0, - 0.45 ) ) ) );
	await Promise.all( jobs );

}

// --- keyframe clips for every moving part, played by one AnimationMixer (as in webgl_animation_keyframes) ---
const mixer = new THREE.AnimationMixer( world );
function spinClip( name, axis, seconds ) {

	const q = new THREE.Quaternion(), times = [], values = [];
	for ( let i = 0; i <= 4; i ++ ) {

		times.push( ( seconds * i ) / 4 );
		q.setFromAxisAngle( axis, ( Math.PI * 2 * i ) / 4 );
		values.push( q.x, q.y, q.z, q.w );

	}
	return new THREE.AnimationClip( name + '.spin', seconds, [ new THREE.QuaternionKeyframeTrack( name + '.quaternion', times, values ) ] );

}
function playOn( root, clip ) {

	mixer.clipAction( clip, root ).play();

}

async function animateParts() {

	world.traverse( ( o ) => {

		if ( /windmill_top_fan/.test( o.name ) ) playOn( o.parent, spinClip( o.name, new THREE.Vector3( 0, 0, 1 ), 5 ) );
		if ( /watermill_wheel/.test( o.name ) ) playOn( o.parent, spinClip( o.name, new THREE.Vector3( 1, 0, 0 ), 7 ) );
		if ( /lumbermill_saw/.test( o.name ) ) playOn( o.parent, spinClip( o.name, new THREE.Vector3( 1, 0, 0 ), 1.2 ) );

	} );
	// clouds drift across on a looping path
	const cloudSpecs = [ [ 'cloud_big', - 9, 5.2, - 4, 1.1, 30 ], [ 'cloud_small', 3, 6.4, - 8, 1.0, 24 ], [ 'cloud_big', 7, 4.6, 6, 0.8, 36 ], [ 'cloud_small', - 6, 5.8, 7, 0.9, 28 ] ];
	for ( const [ name, x, y, z, s, sec ] of cloudSpecs ) {

		const cloud = ( await load( name ) ).scene.clone( true );
		cloud.scale.setScalar( s );
		cloud.traverse( ( o ) => {

			if ( o.isMesh ) {

				o.castShadow = true;
				o.material = o.material.clone();
				o.material.transparent = true;
				o.material.opacity = 0.92;

			}

		} );
		cloud.name = 'cloud' + world.children.length;
		world.add( cloud );
		const times = [ 0, sec / 2, sec ];
		const values = [ x, y, z, x + 6, y + 0.4, z - 3, x, y, z ];
		const clip = new THREE.AnimationClip( cloud.name + '.drift', sec, [ new THREE.VectorKeyframeTrack( cloud.name + '.position', times, values, THREE.InterpolateSmooth ) ] );
		playOn( world, clip );

	}

}

// --- post: a tilt-shift blur above and below the middle band makes it read as a miniature ---
const composer = new EffectComposer( renderer );
composer.addPass( new RenderPass( scene, camera ) );
const hBlur = new ShaderPass( HorizontalTiltShiftShader );
const vBlur = new ShaderPass( VerticalTiltShiftShader );
composer.addPass( hBlur );
composer.addPass( vBlur );
composer.addPass( new OutputPass() );
function sizeBlur() {

	hBlur.uniforms.h.value = 1.6 / window.innerWidth;
	vBlur.uniforms.v.value = 1.6 / window.innerHeight;
	hBlur.uniforms.r.value = vBlur.uniforms.r.value = 0.52;

}
sizeBlur();

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	composer.setSize( window.innerWidth, window.innerHeight );
	sizeBlur();

} );

function animate() {

	timer.update();
	const delta = Math.min( timer.getDelta(), 0.1 );
	mixer.update( delta );
	controls.update( delta );
	composer.render();

}

await build();
await animateParts();
renderer.setAnimationLoop( animate );
window.EXAMPLE = { renderer, scene, camera, ready: true };
