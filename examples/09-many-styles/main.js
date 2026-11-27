// One scene, many styles: the same dancing robot on the same stage, drawn seven ways. First all seven side by side,
// then one at a time. Click a name to pick one, click "All" for the side-by-side view.
//
// Adapted from the official three.js examples (MIT): webgl_animation_skinning_morph (the RobotExpressive model and
// its Dance clip), webgl_materials_toon + OutlineEffect (toon), webgl_postprocessing_pixel (RenderPixelatedPass),
// HalftonePass (comic dots) and webgl_postprocessing_unreal_bloom (glow). The stained glass, LiDAR and hologram looks
// are our own shader patches (onBeforeCompile) on the standard material, so they keep the robot's skinning.
// The robot is RobotExpressive by Tomas Laulhe (Quaternius), CC0 1.0, with facial morphs by Don McCurdy.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.prepend( renderer.domElement );
// the side-by-side view is put together on a 2D canvas on top
const mix = document.createElement( 'canvas' );
mix.id = 'mix';
document.body.insertBefore( mix, renderer.domElement.nextSibling );
const g = mix.getContext( '2d' );

const scene = new THREE.Scene();
const room = new THREE.PMREMGenerator( renderer ).fromScene( new RoomEnvironment(), 0.04 ).texture;
const camera = new THREE.PerspectiveCamera( 32, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.set( - 4.5, 3.6, 10.5 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0, 2.1, 0 );
controls.enableDamping = true;
controls.update();

const sun = new THREE.DirectionalLight( 0xffffff, 2.2 );
sun.position.set( 5, 10, 6 );
sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
Object.assign( sun.shadow.camera, { left: - 6, right: 6, top: 6, bottom: - 6 } );
sun.shadow.bias = - 0.001;
sun.shadow.normalBias = 0.06;
const hemi = new THREE.HemisphereLight( 0xffffff, 0x445566, 0.6 );
scene.add( sun, hemi );

// ---------- the scene: a round stage and the robot ----------
const stage = new THREE.Mesh( new THREE.CylinderGeometry( 3.2, 3.3, 0.35, 96 ), new THREE.MeshStandardMaterial() );
stage.position.y = - 0.175;
stage.receiveShadow = true;
scene.add( stage );
const floor = new THREE.Mesh( new THREE.CircleGeometry( 40, 64 ), new THREE.MeshStandardMaterial() );
floor.rotation.x = - Math.PI / 2;
floor.position.y = - 0.35;
scene.add( floor );

const gltf = await new GLTFLoader().loadAsync( 'assets/robot.glb' );
const robot = gltf.scene;
scene.add( robot );
const mixer = new THREE.AnimationMixer( robot );
mixer.clipAction( THREE.AnimationClip.findByName( gltf.animations, 'Dance' ) ).play();
const parts = [];
robot.traverse( ( o ) => {

	if ( o.isMesh ) {

		o.castShadow = true;
		parts.push( { mesh: o, color: o.material.color.clone(), original: o.material } );

	}

} );

// LiDAR: a grid of dots on the ground (the floor itself is hidden in that look)
const dots = [];
for ( let x = - 40; x <= 40; x ++ ) for ( let z = - 40; z <= 40; z ++ ) dots.push( x * 0.25, - 0.34, z * 0.25 );
const dotGeo = new THREE.BufferGeometry();
dotGeo.setAttribute( 'position', new THREE.Float32BufferAttribute( dots, 3 ) );
const dotGrid = new THREE.Points( dotGeo, new THREE.PointsMaterial( { color: 0x2a6b7a, size: 2, sizeAttenuation: false } ) );
scene.add( dotGrid );

// ---------- shader patches on the standard material (they keep skinning and morphs) ----------
const uTime = { value: 0 };
function patched( base, frag, extra = {} ) {

	const m = new THREE.MeshStandardMaterial( { ...base, ...extra } );
	m.onBeforeCompile = ( s ) => {

		s.uniforms.uTime = uTime;
		s.vertexShader = s.vertexShader.replace( '#include <common>', '#include <common>\nvarying vec3 vW;' )
			.replace( '#include <project_vertex>', '#include <project_vertex>\nvW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' );
		s.fragmentShader = s.fragmentShader.replace( '#include <common>', '#include <common>\nvarying vec3 vW;\nuniform float uTime;\n' + LIB )
			.replace( '#include <opaque_fragment>', frag );

	};
	m.customProgramCacheKey = () => frag;
	return m;

}
const LIB = /* glsl */`
vec3 hash3( vec3 p ) { p = vec3( dot( p, vec3( 127.1, 311.7, 74.7 ) ), dot( p, vec3( 269.5, 183.3, 246.1 ) ), dot( p, vec3( 113.5, 271.9, 124.6 ) ) ); return fract( sin( p ) * 43758.5453 ); }
vec3 voronoi( vec3 x ) {
	vec3 p = floor( x ), f = fract( x ); float d1 = 8.0, d2 = 8.0; vec3 id = vec3( 0.0 );
	for ( int k = - 1; k <= 1; k ++ ) for ( int j = - 1; j <= 1; j ++ ) for ( int i = - 1; i <= 1; i ++ ) {
		vec3 b = vec3( float( i ), float( j ), float( k ) ); vec3 r = b + hash3( p + b ) - f; float d = dot( r, r );
		if ( d < d1 ) { d2 = d1; d1 = d; id = p + b; } else if ( d < d2 ) d2 = d;
	}
	return vec3( sqrt( d2 ) - sqrt( d1 ), hash3( id ).xy );
}
vec3 pal( float t ) { return 0.5 + 0.5 * cos( 6.28318 * ( t * 0.85 + vec3( 0.0, 0.33, 0.67 ) ) ); }
`;
// stained glass: jewel coloured cells with dark lead between them, lit from behind
const GLASS = /* glsl */`
	vec3 v = voronoi( vW * 3.4 );
	vec3 jewels[5] = vec3[5]( vec3( 0.75, 0.05, 0.12 ), vec3( 0.05, 0.22, 0.8 ), vec3( 0.02, 0.55, 0.3 ), vec3( 0.95, 0.62, 0.08 ), vec3( 0.45, 0.1, 0.65 ) );
	vec3 c = jewels[ int( v.y * 4.99 ) ] * ( 0.55 + 0.45 * v.z );
	float lead = 1.0 - smoothstep( 0.04, 0.07, v.x );
	vec3 lit = outgoingLight * 0.12 + c * ( 0.8 + 0.25 * sin( uTime * 1.5 + v.z * 6.0 ) );
	gl_FragColor = vec4( mix( lit, vec3( 0.015 ), lead ), 1.0 );
`;
// LiDAR: dotted scan rings coloured by height, a bright sweep that moves up and down
const LIDAR = /* glsl */`
	float ring = fract( vW.y * 14.0 );
	float dash = fract( ( vW.x + vW.z * 1.3 ) * 18.0 );
	if ( ring > 0.32 || dash > 0.55 ) discard;
	float sweep = exp( - abs( vW.y - ( 2.3 + 2.4 * sin( uTime * 0.9 ) ) ) * 5.0 );
	gl_FragColor = vec4( pal( vW.y / 5.0 ) * ( 0.9 + 2.5 * sweep ), 1.0 );
`;
// the same two looks for the flat stage: rings around the centre instead of rings up the body
const LIDAR_PAD = /* glsl */`
	float r = length( vW.xz );
	if ( fract( r * 6.0 ) > 0.3 || fract( atan( vW.z, vW.x ) * 40.0 ) > 0.5 ) discard;
	gl_FragColor = vec4( pal( 0.05 + r * 0.04 ) * 0.8, 1.0 );
`;
const HOLO_PAD = /* glsl */`
	float r = length( vW.xz );
	float line = 1.0 - smoothstep( 0.0, 0.04, abs( fract( r * 2.2 - uTime * 0.3 ) - 0.5 ) );
	gl_FragColor = vec4( vec3( 0.25, 0.85, 1.0 ) * ( 0.03 + line * 0.5 ), 1.0 );
`;
// hologram: bright at the edges (fresnel), moving scan lines
const HOLO = /* glsl */`
	float fr = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.2 );
	float scan = 0.55 + 0.45 * step( 0.45, fract( vW.y * 16.0 - uTime * 1.6 ) );
	gl_FragColor = vec4( vec3( 0.25, 0.85, 1.0 ) * ( 0.08 + fr * 1.8 ) * scan, 1.0 );
`;

// toon: three shades, hard steps (webgl_materials_toon)
const steps = new THREE.DataTexture( new Uint8Array( [ 70, 160, 255 ] ), 3, 1, THREE.RedFormat );
steps.minFilter = steps.magFilter = THREE.NearestFilter;
steps.needsUpdate = true;
const toon = ( color ) => new THREE.MeshToonMaterial( { color, gradientMap: steps } );

// ---------- the seven looks ----------
const bg = ( a, b ) => {

	const c = document.createElement( 'canvas' );
	c.width = 2; c.height = 256;
	const x = c.getContext( '2d' ), gr = x.createLinearGradient( 0, 0, 0, 256 );
	gr.addColorStop( 0, a ); gr.addColorStop( 1, b );
	x.fillStyle = gr; x.fillRect( 0, 0, 2, 256 );
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	return t;

};
const STYLES = [
	{ name: 'Studio', bg: bg( '#dfe6ee', '#9fb0c2' ), env: room, robot: ( p ) => p.original, stage: { color: 0xf2f2f2, roughness: 0.4 }, floor: { color: 0xb8c4d0 }, post: 'plain' },
	{ name: 'Toon', bg: bg( '#7fd3ff', '#c8f0b0' ), robot: ( p ) => toon( p.color ), stage: toon( 0xff8a65 ), floor: null, post: 'outline' },
	{ name: 'Stained glass', bg: bg( '#120a1e', '#05030a' ), robot: ( p ) => patched( { color: p.color }, GLASS ), stage: patched( { color: 0x888888 }, GLASS ), floor: { color: 0x0a0810, roughness: 0.3 }, post: 'bloom', bloom: [ 0.35, 0.3, 0.55 ] },
	{ name: 'LiDAR scan', bg: new THREE.Color( 0x020405 ), robot: () => patched( {}, LIDAR ), stage: patched( {}, LIDAR_PAD ), floor: null, dots: true, post: 'bloom', bloom: [ 0.7, 0.3, 0.2 ] },
	{ name: 'Pixel art', bg: bg( '#2b1d4a', '#f28f5b' ), robot: ( p ) => toon( p.color ), stage: toon( 0x5c4b8a ), floor: toon( 0x3b2f63 ), post: 'pixel' },
	{ name: 'Comic dots', bg: bg( '#fff4d6', '#ffd9a0' ), env: room, robot: ( p ) => p.original, stage: { color: 0xff5a5a, roughness: 0.5 }, floor: { color: 0xffe9b8 }, post: 'halftone' },
	{ name: 'Hologram', bg: bg( '#04121a', '#000306' ), robot: () => patched( {}, HOLO, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } ), stage: patched( {}, HOLO_PAD, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } ), floor: null, dots: true, post: 'bloom', bloom: [ 0.75, 0.45, 0.05 ] },
];
for ( const s of STYLES ) {

	// build each look's materials once
	s.robotMats = parts.map( ( p ) => s.robot( p ) );
	s.stageMat = s.stage?.isMaterial ? s.stage : new THREE.MeshStandardMaterial( s.stage );
	s.floorMat = s.floor === null ? null : ( s.floor.isMaterial ? s.floor : new THREE.MeshStandardMaterial( s.floor ) );

}

// a flat floor has no silhouette; its outline would only z-fight with itself
for ( const st of STYLES ) if ( st.floorMat?.isMeshToonMaterial ) st.floorMat.userData.outlineParameters = { visible: false };
const outline = new OutlineEffect( renderer, { defaultThickness: 0.004 } );
const composers = {};
function composerFor( s ) {

	const key = s.name;
	if ( composers[ key ] ) return composers[ key ];
	const c = new EffectComposer( renderer );
	if ( s.post === 'pixel' ) c.addPass( new RenderPixelatedPass( 6, scene, camera, { normalEdgeStrength: 0.6, depthEdgeStrength: 0.5 } ) );
	else c.addPass( new RenderPass( scene, camera ) );
	if ( s.post === 'bloom' ) c.addPass( new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), ...s.bloom ) );
	if ( s.post === 'halftone' ) c.addPass( new HalftonePass( { shape: 1, radius: 5, rotateR: Math.PI / 12, rotateG: Math.PI / 12 * 2, rotateB: Math.PI / 12 * 3, scatter: 0, blending: 1, blendingMode: 1, greyscale: false } ) );
	c.addPass( new OutputPass() );
	composers[ key ] = c;
	return c;

}

function apply( s ) {

	scene.background = s.bg;
	scene.environment = s.env || null;
	parts.forEach( ( p, i ) => ( p.mesh.material = s.robotMats[ i ] ) );
	stage.material = s.stageMat;
	floor.visible = !! s.floorMat;
	if ( s.floorMat ) floor.material = s.floorMat;
	dotGrid.visible = !! s.dots;
	sun.intensity = s.name === 'Toon' || s.name === 'Pixel art' ? 2.8 : 2.2;

}
function draw( s ) {

	apply( s );
	if ( s.post === 'outline' ) outline.render( scene, camera );
	else if ( s.post === 'plain' ) renderer.render( scene, camera );
	else composerFor( s ).render();

}

// ---------- buttons ----------
let pick = - 1; // -1 = all side by side
let auto = true;
const bar = document.querySelector( '.styles' );
const buttons = [ 'All', ...STYLES.map( ( s ) => s.name ) ].map( ( name, i ) => {

	const b = document.createElement( 'button' );
	b.textContent = name;
	b.onclick = () => {

		auto = false;
		pick = i - 1;

	};
	bar.appendChild( b );
	return b;

} );

function resize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
	for ( const c of Object.values( composers ) ) c.setSize( window.innerWidth, window.innerHeight );
	mix.width = renderer.domElement.width;
	mix.height = renderer.domElement.height;

}
window.addEventListener( 'resize', resize );
resize();

const timer = new THREE.Timer();
timer.connect( document );
let userMoved = false;
let t0 = - 1;
controls.addEventListener( 'start', () => ( userMoved = true ) );

function animate() {

	timer.update();
	const dt = timer.getDelta();
	if ( t0 < 0 ) t0 = timer.getElapsed();
	const t = timer.getElapsed() - t0; // seconds since the first frame
	mixer.update( dt );
	uTime.value = t;
	// left alone: 4 s all side by side, then each look for 2 s, then all again
	if ( auto ) {

		const k = t % ( 4 + STYLES.length * 2 );
		pick = k < 4 ? - 1 : Math.floor( ( k - 4 ) / 2 );

	}
	buttons.forEach( ( b, i ) => b.classList.toggle( 'on', i - 1 === pick ) );
	if ( ! userMoved ) {

		// a little further back in the side-by-side view, so the whole robot fits in each strip
		const a = - 0.42 + Math.sin( t * 0.25 ) * 0.35, d = pick < 0 ? 23 : 11.4;
		camera.position.set( Math.sin( a ) * d, 3.6 + ( d - 11.4 ) * 0.12, Math.cos( a ) * d );

	}
	controls.update();
	if ( pick >= 0 ) {

		mix.style.display = 'none';
		draw( STYLES[ pick ] );
		return;

	}
	// all seven: render each look, copy a slanted strip of it onto the 2D canvas
	mix.style.display = 'block';
	if ( mix.width !== renderer.domElement.width || mix.height !== renderer.domElement.height ) {

		mix.width = renderer.domElement.width;
		mix.height = renderer.domElement.height;

	}
	const W = mix.width, H = mix.height, n = STYLES.length, slant = H * 0.18, w = W / n;
	// strip i is centred on ( i + 0.5 ) * w at mid height and leans right; the outer strips run off the screen
	const edge = ( i ) => ( i === 0 ? - W : i === n ? 2 * W : i * w );
	STYLES.forEach( ( s, i ) => {

		// slide the picture sideways (setViewOffset) so the robot stands in the middle of this strip
		const cx = ( i + 0.5 ) * w;
		camera.setViewOffset( W, H, W / 2 - cx, 0, W, H );
		draw( s );
		g.save();
		g.beginPath();
		const a = edge( i ), b = edge( i + 1 ) + 1, h = slant / 2;
		g.moveTo( a + h, 0 ); g.lineTo( b + h, 0 ); g.lineTo( b - h, H ); g.lineTo( a - h, H );
		g.closePath();
		g.clip();
		g.drawImage( renderer.domElement, 0, 0 );
		g.restore();

	} );
	camera.clearViewOffset();

}
renderer.setAnimationLoop( animate );
window.RESTART = () => ( t0 = - 1 ); // start the tour again from the side-by-side view
window.EXAMPLE = { renderer, scene, camera, ready: true };
