// A product page that moves with your scroll: the speaker turns, travels and lights up as you read down the page.
//
// Adapted from tsogjavklann/awwwards-3d, coin-scroll template (MIT): fixed WebGL canvas behind normal HTML sections,
// RoomEnvironment + warm three-point light, a soft shadow floor, UnrealBloom + vignette + film grain, and damped
// "current -> target" values so everything eases. Changes: GSAP ScrollTrigger and Lenis are replaced by a few lines
// that read the scroll position (no extra libraries), the coin is replaced by the Khronos "BoomBox" model (CC0,
// Microsoft), and each section has its own pose and background colour.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// one pose per section: where the speaker is, how it is turned, how far the camera is, the background colour
const POSES = [
	{ x: 0.0, y: 0.15, ry: - 0.35, rx: 0.12, cam: 6.4, bg: 0x0c0a08 },
	{ x: - 1.35, y: 0.0, ry: Math.PI * 0.75, rx: 0.2, cam: 5.6, bg: 0x081316 },
	{ x: 1.35, y: 0.1, ry: Math.PI * 2 - 0.2, rx: - 0.1, cam: 4.4, bg: 0x140a18 },
	{ x: - 1.2, y: - 0.2, ry: Math.PI * 2.35, rx: 0.35, cam: 6.2, bg: 0x0d0b06 },
];

const canvas = document.getElementById( 'webgl' );
const renderer = new THREE.WebGLRenderer( { canvas, antialias: false, powerPreference: 'high-performance' } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color( POSES[ 0 ].bg );
scene.fog = new THREE.FogExp2( POSES[ 0 ].bg, 0.04 );
const camera = new THREE.PerspectiveCamera( 32, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.set( 0, 0.4, 7 );

const pmrem = new THREE.PMREMGenerator( renderer );
scene.environment = pmrem.fromScene( new RoomEnvironment(), 0.04 ).texture;
scene.environmentIntensity = 0.55;

// warm three-point light, as in the template (gold needs a warm key)
const key = new THREE.DirectionalLight( 0xffe6b8, 2.2 );
key.position.set( 4, 7, 5 );
key.castShadow = true;
key.shadow.mapSize.set( 1024, 1024 );
key.shadow.radius = 8;
Object.assign( key.shadow.camera, { left: - 6, right: 6, top: 6, bottom: - 6, near: 0.5, far: 25 } );
const fill = new THREE.DirectionalLight( 0x6090ff, 0.5 );
fill.position.set( - 5, 2, 3 );
const rim = new THREE.DirectionalLight( 0xffffff, 0.9 );
rim.position.set( 0, 4, - 7 );
scene.add( key, fill, rim );

const floor = new THREE.Mesh( new THREE.PlaneGeometry( 20, 20 ), new THREE.ShadowMaterial( { opacity: 0.5 } ) );
floor.rotation.x = - Math.PI / 2;
floor.position.y = - 1.35;
floor.receiveShadow = true;
scene.add( floor );

// two layers, like the template: the group travels, the model inside turns
const group = new THREE.Group();
scene.add( group );
let model = null;
let glow = null;
const gltf = await new GLTFLoader().loadAsync( 'assets/boombox.glb' );
model = gltf.scene;
const box = new THREE.Box3().setFromObject( model );
const size = box.getSize( new THREE.Vector3() );
model.scale.setScalar( 1.9 / Math.max( size.x, size.y ) );
box.setFromObject( model );
model.position.sub( box.getCenter( new THREE.Vector3() ) );
const pivot = new THREE.Group();
pivot.add( model );
group.add( pivot );
model.traverse( ( o ) => {

	if ( o.isMesh ) {

		o.castShadow = o.receiveShadow = true;
		if ( o.material.emissiveMap ) glow = o.material;

	}

} );

// post: bloom, vignette, grain (the template's passes)
const composer = new EffectComposer( renderer, new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType } ) );
composer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
composer.setSize( window.innerWidth, window.innerHeight );
composer.addPass( new RenderPass( scene, camera ) );
const bloom = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 0.35, 0.4, 0.92 );
composer.addPass( bloom );
const quad = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }';
composer.addPass( new ShaderPass( {
	uniforms: { tDiffuse: { value: null }, uOffset: { value: 0.45 }, uDarkness: { value: 0.6 } },
	vertexShader: quad,
	fragmentShader: `uniform sampler2D tDiffuse; uniform float uOffset; uniform float uDarkness; varying vec2 vUv;
		void main() { vec4 c = texture2D( tDiffuse, vUv ); float v = smoothstep( 0.8, uOffset, length( vUv - 0.5 ) ); gl_FragColor = vec4( mix( c.rgb * ( 1.0 - uDarkness ), c.rgb, v ), c.a ); }`,
} ) );
composer.addPass( new OutputPass() );
const grain = new ShaderPass( {
	uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uIntensity: { value: 0.04 } },
	vertexShader: quad,
	fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uIntensity; varying vec2 vUv;
		float rand( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
		void main() { vec4 c = texture2D( tDiffuse, vUv ); gl_FragColor = vec4( c.rgb + ( rand( vUv + uTime ) - 0.5 ) * uIntensity, c.a ); }`,
} );
composer.addPass( grain );

// ---------- scroll: progress 0..1 down the page -> a pose between two sections ----------
const bar = document.querySelector( '.bar' );
const progress = () => {

	const h = document.documentElement.scrollHeight - window.innerHeight;
	return h > 0 ? window.scrollY / h : 0;

};
const smooth = ( t ) => t * t * ( 3 - 2 * t );
const bgA = new THREE.Color(), bgB = new THREE.Color();
function poseAt( p ) {

	const f = p * ( POSES.length - 1 );
	const i = Math.min( Math.floor( f ), POSES.length - 2 );
	const k = smooth( f - i );
	const A = POSES[ i ], B = POSES[ i + 1 ];
	const out = {};
	for ( const key of [ 'x', 'y', 'ry', 'rx', 'cam' ] ) out[ key ] = A[ key ] + ( B[ key ] - A[ key ] ) * k;
	out.bg = bgA.set( A.bg ).lerp( bgB.set( B.bg ), k );
	return out;

}

// damped values, like the template's lerp state
const state = { x: 0, y: 0, ry: 0, rx: 0, cam: 7, mx: 0, my: 0, intro: 0 };
const target = { mx: 0, my: 0 };
window.addEventListener( 'mousemove', ( e ) => {

	target.mx = ( e.clientX / window.innerWidth ) * 2 - 1;
	target.my = - ( ( e.clientY / window.innerHeight ) * 2 - 1 );

} );
window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	composer.setSize( window.innerWidth, window.innerHeight );

} );

const timer = new THREE.Timer();
timer.connect( document );
const damp = ( a, b, ease, dt ) => a + ( b - a ) * ( 1 - Math.pow( 1 - ease, dt * 60 ) );
function tick() {

	timer.update();
	const dt = Math.min( timer.getDelta(), 0.1 );
	const t = timer.getElapsed();
	const p = progress();
	bar.style.width = ( p * 100 ).toFixed( 2 ) + '%';
	const goal = poseAt( p );
	for ( const k of [ 'x', 'y', 'ry', 'rx', 'cam' ] ) state[ k ] = damp( state[ k ], goal[ k ], 0.08, dt );
	state.mx = damp( state.mx, target.mx, 0.12, dt );
	state.my = damp( state.my, target.my, 0.12, dt );
	state.intro = damp( state.intro, 1, 0.035, dt );
	scene.background.copy( goal.bg );
	scene.fog.color.copy( goal.bg );

	// intro: the camera flies in from far away (the template's GSAP intro, as an eased value)
	const fly = 1 - state.intro;
	camera.position.set( state.mx * 0.25, 0.4 + state.my * 0.15, state.cam + fly * 9 );
	camera.lookAt( 0, 0, 0 );
	group.position.set( state.x, state.y + Math.sin( t * 0.8 ) * 0.05 + fly * 3, 0 );
	pivot.rotation.set( state.rx, state.ry + fly * 1.5, 0 );
	if ( glow ) glow.emissiveIntensity = 0.8 + 0.7 * Math.pow( 0.5 + 0.5 * Math.sin( t * 2 * Math.PI * 1.9 ), 4 ); // a beat, 114 bpm
	grain.uniforms.uTime.value = t;
	composer.render();

}
renderer.setAnimationLoop( tick );
window.EXAMPLE = { renderer, scene, camera, ready: true };
