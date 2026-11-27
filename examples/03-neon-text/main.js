// Neon text: 3D letters that light up one by one like real neon tubes, a wet street that reflects them, and city
// lights far behind that melt into soft bokeh.
//
// Adapted from the official three.js examples (MIT): webgl_postprocessing_unreal_bloom (EffectComposer + RenderPass +
// UnrealBloomPass + OutputPass), webgl_geometry_text (FontLoader + TextGeometry with bevel) and
// webgl_postprocessing_dof (BokehPass). The bloom example's ion-drive model is not used; the letters are the subject.
// The typefaces are small glyph subsets that ship with this kit (SIL Open Font License, see licenses/fonts-OFL.txt).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const WORDS = [ { text: 'NEON', font: 'light', size: 1.15, color: 0xff2f7d, y: 1.95 }, { text: 'dreams', font: 'serif', size: 0.78, color: 0x2fe4ff, y: 0.75 } ];

const timer = new THREE.Timer();
timer.connect( document );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x05030a );
scene.fog = new THREE.FogExp2( 0x07040f, 0.035 );
const camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 0.1, 200 );
camera.position.set( 0, 1.5, 12 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0, 1.35, 0 );
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.5;
controls.minDistance = 4;
controls.maxDistance = 20;

// --- the wall the sign hangs on: dark brick-ish panel, lit only by the neon ---
const tex = new THREE.TextureLoader();
const brick = ( f, srgb ) => {

	const t = tex.load( 'assets/' + f );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set( 3, 2.2 );
	t.anisotropy = 8;
	if ( srgb ) t.colorSpace = THREE.SRGBColorSpace;
	return t;

};
const wall = new THREE.Mesh( new THREE.PlaneGeometry( 30, 14 ), new THREE.MeshStandardMaterial( { map: brick( 'brick_diff_1k.jpg', true ), normalMap: brick( 'brick_nor_1k.jpg' ), roughnessMap: brick( 'brick_rough_1k.jpg' ), color: 0x6a6070 } ) );
wall.position.set( 0, 6, - 0.45 );
scene.add( wall );

// a street lamp off to the left grazes the bricks
const lamp = new THREE.SpotLight( 0xffb36b, 60, 20, 0.5, 0.8, 1.6 );
lamp.position.set( - 5, 7, 3 );
lamp.target.position.set( - 0.5, 2.5, - 0.4 );
scene.add( lamp, lamp.target );

// --- wet street: a mirror under a rough dark layer, so reflections are streaky and dim ---
const mirror = new Reflector( new THREE.PlaneGeometry( 60, 60 ), { textureWidth: window.innerWidth * 0.5, textureHeight: window.innerHeight * 0.5, color: 0x55555e } );
mirror.rotation.x = - Math.PI / 2;
mirror.position.y = - 0.01;
scene.add( mirror );
const wet = new THREE.Mesh( new THREE.PlaneGeometry( 60, 60 ), new THREE.MeshStandardMaterial( { color: 0x05040a, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.7 } ) );
wet.rotation.x = - Math.PI / 2;
scene.add( wet );

// --- the letters: a glowing tube (emissive) inside a dark metal channel, each letter its own mesh ---
const fonts = {};
const loader = new FontLoader();
for ( const w of WORDS ) fonts[ w.font ] ??= await loader.loadAsync( `assets/${w.font}.typeface.json` );

const letters = [];
const lights = [];
for ( const w of WORDS ) {

	const font = fonts[ w.font ];
	const scale = w.size / font.data.resolution;
	// lay the letters out with the font's own advance widths
	let width = 0;
	for ( const ch of w.text ) width += ( font.data.glyphs[ ch ]?.ha ?? 0 ) * scale;
	let x = - width / 2;
	for ( const ch of w.text ) {

		const g = font.data.glyphs[ ch ];
		if ( ch !== ' ' ) {

			const geo = new TextGeometry( ch, { font, size: w.size, depth: 0.08, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 4 } );
			const tube = new THREE.Mesh( geo, new THREE.MeshStandardMaterial( { color: 0x111111, emissive: w.color, emissiveIntensity: 0, roughness: 0.3 } ) );
			tube.position.set( x, w.y, 0 );
			scene.add( tube );
			// the dark backing channel behind each tube
			const back = new THREE.Mesh( geo, new THREE.MeshStandardMaterial( { color: 0x0b0b10, metalness: 0.8, roughness: 0.4 } ) );
			back.position.set( x + 0.03, w.y - 0.03, - 0.12 );
			back.scale.z = 0.6;
			scene.add( back );
			letters.push( { tube, color: w.color, i: letters.length } );

		}
		x += ( g?.ha ?? 0 ) * scale;

	}
	// one coloured light per word, so the wall and the street pick up the glow
	const l = new THREE.PointLight( w.color, 0, 6, 2 );
	l.position.set( 0, w.y + w.size * 0.4, 1.2 );
	scene.add( l );
	lights.push( l );

}

// --- the city far behind: hundreds of small lights that the depth of field turns into bokeh ---
const bokeh = new THREE.InstancedMesh( new THREE.SphereGeometry( 0.12, 12, 8 ), new THREE.MeshBasicMaterial( { toneMapped: false } ), 420 );
const m = new THREE.Matrix4(), c = new THREE.Color();
const palette = [ 0xffb347, 0xff5fa2, 0x58d6ff, 0xfff1c9, 0xa98bff ];
let s = 3;
const r = () => ( ( s = ( s * 16807 ) % 2147483647 ) / 2147483647 );
for ( let i = 0; i < bokeh.count; i ++ ) {

	m.makeScale( 1, 1, 1 ).setPosition( ( r() - 0.5 ) * 60, r() * 12 - 1, - 18 - r() * 30 );
	bokeh.setMatrixAt( i, m );
	bokeh.setColorAt( i, c.set( palette[ i % palette.length ] ).multiplyScalar( 1.2 + r() * 2.5 ) );

}
scene.add( bokeh );
wall.position.z = - 0.45;
wall.scale.set( 0.36, 0.62, 1 ); // a narrow building front; the city shows around it
wall.position.set( 0, 2.4, - 0.45 );

// --- post: bloom for the glow, bokeh for the depth, as in the official examples ---
const composer = new EffectComposer( renderer );
composer.addPass( new RenderPass( scene, camera ) );
const bloom = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 0.85, 0.22, 0.3 );
composer.addPass( bloom );
const dof = new BokehPass( scene, camera, { focus: 11, aperture: 0.0009, maxblur: 0.009 } );
composer.addPass( dof );
composer.addPass( new OutputPass() );

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	composer.setSize( window.innerWidth, window.innerHeight );

} );

// neon ignition: each letter stutters on in turn, then hums with a tiny flicker
const hash = ( n ) => ( Math.sin( n * 127.1 ) * 43758.5453 ) % 1;
function glow( i, t ) {

	const start = 0.35 + i * 0.22;
	if ( t < start ) return 0;
	const k = t - start;
	if ( k < 0.35 ) return Math.abs( hash( Math.floor( k * 30 ) + i * 7 ) ) > 0.45 ? 1 : 0.08;
	const hum = 0.92 + 0.08 * Math.sin( t * 31 + i ) * Math.sin( t * 7.3 + i * 2 );
	const blink = i === 2 && ( t % 6.5 ) > 5.6 && ( t % 6.5 ) < 5.75 ? 0.15 : 1; // one tube that misbehaves
	return hum * blink;

}

let userMoved = false;
controls.addEventListener( 'start', () => ( userMoved = true ) );

function animate() {

	timer.update();
	const t = timer.getElapsed();
	let sum = [ 0, 0 ];
	for ( const L of letters ) {

		const g = glow( L.i, t );
		L.tube.material.emissiveIntensity = g * 2.4;
		sum[ L.color === WORDS[ 0 ].color ? 0 : 1 ] += g;

	}
	lights[ 0 ].intensity = sum[ 0 ] * 2.2;
	lights[ 1 ].intensity = sum[ 1 ] * 1.6;
	if ( ! userMoved ) {

		const a = Math.sin( t * 0.18 ) * 0.3;
		const d = 12 - Math.min( t, 8 ) * 0.15;
		camera.position.set( Math.sin( a ) * d, 1.2 + Math.sin( t * 0.13 ) * 0.2, Math.cos( a ) * d );

	}
	controls.update();
	dof.uniforms.focus.value = camera.position.distanceTo( controls.target );
	composer.render();

}
renderer.setAnimationLoop( animate );
window.EXAMPLE = { renderer, scene, camera, ready: true };
