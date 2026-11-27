// Gaussian splats: a 3D scene made of hundreds of thousands of soft coloured blobs, the way phone and drone scans are
// shown on the web. It appears with a sweeping "magic" reveal, then turns slowly; drag to look around.
// Drop your own .spz / .ply / .splat capture on the page to view it instead.
//
// Built on Spark by World Labs (@sparkjsdev/spark, MIT, see lib/spark/LICENSE): SparkRenderer + SplatMesh, splats
// built in code with constructSplats (from the "procedural-splats" example) and the "Magic" reveal from the
// "splat-reveal-effects" example (a dyno shader on every splat). The splats here are made in your browser from a
// CC0 photoscan: Poly Haven "Gothic Statue" (surface samples, coloured from its photo texture) standing on
// Poly Haven "Mossy Rock" ground. No splat file is downloaded.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { SparkRenderer, SplatMesh, dyno } from '@sparkjsdev/spark';

const renderer = new THREE.WebGLRenderer( { antialias: false } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x07080b );
scene.add( new SparkRenderer( { renderer } ) );
const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.05, 100 );
camera.position.set( 0.5, 1.3, 3.1 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0, 0.92, 0 );
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.update();

let seed = 9;
const rand = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );
const pixels = ( img ) => {

	const c = document.createElement( 'canvas' );
	c.width = img.width; c.height = img.height;
	const g = c.getContext( '2d' );
	g.drawImage( img, 0, 0 );
	return { w: c.width, h: c.height, data: g.getImageData( 0, 0, c.width, c.height ).data };

};
const at = ( px, u, v, out ) => {

	const x = Math.min( px.w - 1, Math.max( 0, Math.floor( ( ( u % 1 ) + 1 ) % 1 * px.w ) ) );
	const y = Math.min( px.h - 1, Math.max( 0, Math.floor( ( ( v % 1 ) + 1 ) % 1 * px.h ) ) );
	const i = ( y * px.w + x ) * 4;
	return out.setRGB( px.data[ i ] / 255, px.data[ i + 1 ] / 255, px.data[ i + 2 ] / 255 );

};

// light baked into the colours, like a real capture (a warm key from the upper left, a cool fill)
const key = new THREE.Vector3( - 0.5, 0.8, 0.45 ).normalize(), fillDir = new THREE.Vector3( 0.7, 0.2, - 0.4 ).normalize();
const shade = ( n, c ) => {

	const k = Math.max( 0, n.dot( key ) ), f = Math.max( 0, n.dot( fillDir ) );
	return c.setRGB( c.r * ( 0.22 + 1.05 * k ) + c.r * 0.25 * f * 0.6, c.g * ( 0.22 + 0.98 * k ) + c.g * 0.25 * f * 0.8, c.b * ( 0.24 + 0.86 * k ) + c.b * 0.25 * f );

};

// ---------- the statue: surface samples -> flat splats facing out ----------
const gltf = await new GLTFLoader().loadAsync( 'assets/gothic_statue.gltf' );
let statueMesh;
gltf.scene.traverse( ( o ) => o.isMesh && ( statueMesh = o ) );
gltf.scene.updateMatrixWorld( true );
const bb = new THREE.Box3().setFromObject( gltf.scene );
const fit = 1.95 / ( bb.max.y - bb.min.y );
const statueTex = pixels( statueMesh.material.map.image );
const sampler = new MeshSurfaceSampler( statueMesh ).setRandomGenerator( rand ).build();
const normalMatrix = new THREE.Matrix3().getNormalMatrix( statueMesh.matrixWorld );
const N_STATUE = 320000, N_GROUND = 220000;

const statue = new SplatMesh( {
	constructSplats: ( splats ) => {

		const p = new THREE.Vector3(), n = new THREE.Vector3(), uv = new THREE.Vector2(), c = new THREE.Color();
		const q = new THREE.Quaternion(), z = new THREE.Vector3( 0, 0, 1 ), s = new THREE.Vector3( 0.0052, 0.0052, 0.0009 );
		for ( let i = 0; i < N_STATUE; i ++ ) {

			sampler.sample( p, n, null, uv );
			p.applyMatrix4( statueMesh.matrixWorld ).sub( bb.min ).multiplyScalar( fit );
			p.x -= ( bb.max.x - bb.min.x ) * fit / 2;
			p.z -= ( bb.max.z - bb.min.z ) * fit / 2;
			n.applyMatrix3( normalMatrix ).normalize();
			q.setFromUnitVectors( z, n );
			shade( n, at( statueTex, uv.x, uv.y, c ) );
			splats.pushSplat( p, s, q, 1, c );

		}

	},
} );

// ---------- the ground: a mossy disc, splats fade out at the edge ----------
const moss = pixels( await new Promise( ( ok ) => {

	const img = new Image();
	img.onload = () => ok( img );
	img.src = 'assets/mossy_rock_diff_512.jpg';

} ) );
const ground = new SplatMesh( {
	constructSplats: ( splats ) => {

		const p = new THREE.Vector3(), c = new THREE.Color(), q = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2, 0, 0 ) );
		const n = new THREE.Vector3( 0, 1, 0 );
		for ( let i = 0; i < N_GROUND; i ++ ) {

			const r = 4 * Math.sqrt( rand() ), a = rand() * Math.PI * 2;
			p.set( Math.cos( a ) * r, 0.015 * Math.sin( r * 9 + a * 3 ) + 0.01 * rand(), Math.sin( a ) * r );
			n.set( 0.25 * ( rand() - 0.5 ), 1, 0.25 * ( rand() - 0.5 ) ).normalize();
			shade( n, at( moss, p.x * 0.45, p.z * 0.45, c ) );
			c.multiplyScalar( 0.85 );
			const s = 0.006 + 0.004 * rand();
			splats.pushSplat( p, new THREE.Vector3( s, s, 0.001 ), q, Math.min( 1, Math.max( 0, ( 4 - r ) / 2.2 ) ), c );

		}

	},
} );
scene.add( ground, statue );
document.getElementById( 'count' ).textContent = `${( ( N_STATUE + N_GROUND ) / 1000 ).toFixed( 0 )}k Gaussian splats`;

// ---------- the "Magic" reveal (splat-reveal-effects), on both meshes ----------
const revealT = dyno.dynoFloat( 0 );
function magic( mesh ) {

	mesh.objectModifier = dyno.dynoBlock( { gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ( { gsplat } ) => {

		const d = new dyno.Dyno( {
			inTypes: { gsplat: dyno.Gsplat, t: 'float' },
			outTypes: { gsplat: dyno.Gsplat },
			globals: () => [ dyno.unindent( /* glsl */`
				vec3 hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( vec3( p.x * p.y * p.z, p.x + p.y * p.z, p.x * p.y + p.z ) ); }
				vec3 noise( vec3 p ) {
					vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
					return mix( mix( mix( hash( i ), hash( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash( i + vec3( 0, 1, 0 ) ), hash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
						mix( mix( hash( i + vec3( 0, 0, 1 ) ), hash( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash( i + vec3( 0, 1, 1 ) ), hash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
				}
			` ) ],
			statements: ( { inputs, outputs } ) => dyno.unindentLines( /* glsl */`
				${outputs.gsplat} = ${inputs.gsplat};
				float t = ${inputs.t};
				float s = smoothstep( 0., 10., t - 4.5 ) * 10.;
				vec3 scales = ${inputs.gsplat}.scales;
				vec3 localPos = ${inputs.gsplat}.center;
				float l = length( localPos.xz );
				float border = abs( s - l - .5 );
				localPos *= 1. - .2 * exp( - 20. * border );
				vec3 finalScales = mix( scales, vec3( 0.002 ), smoothstep( s - .5, s, l + .5 ) );
				${outputs.gsplat}.center = localPos + .1 * noise( localPos.xyz * 2. + t * .5 ) * smoothstep( s - .5, s, l + .5 );
				${outputs.gsplat}.scales = finalScales;
				float at = atan( localPos.x, localPos.z ) / 3.1416;
				${outputs.gsplat}.rgba *= step( at, t - 3.1416 );
				${outputs.gsplat}.rgba += exp( - 20. * border ) + exp( - 50. * abs( t - at - 3.1416 ) ) * .5;
			` ),
		} );
		gsplat = d.apply( { gsplat, t: revealT } ).gsplat;
		return { gsplat };

	} );
	mesh.updateGenerator();

}
await Promise.all( [ statue.initialized, ground.initialized ].filter( Boolean ) );
magic( statue );
magic( ground );

// ---------- drop your own capture ----------
const drop = document.querySelector( '.drop' );
addEventListener( 'dragover', ( e ) => {

	e.preventDefault();
	drop.classList.add( 'on' );

} );
addEventListener( 'dragleave', () => drop.classList.remove( 'on' ) );
addEventListener( 'drop', async ( e ) => {

	e.preventDefault();
	drop.classList.remove( 'on' );
	const file = e.dataTransfer.files[ 0 ];
	if ( ! file ) return;
	const mine = new SplatMesh( { fileBytes: await file.arrayBuffer(), fileName: file.name } );
	mine.quaternion.set( 1, 0, 0, 0 ); // most captures are stored upside down (OpenCV axes); this turns them upright
	scene.remove( statue, ground );
	scene.add( mine );
	await mine.initialized;
	document.getElementById( 'count' ).textContent = file.name;

} );

addEventListener( 'resize', () => {

	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( innerWidth, innerHeight );

} );
controls.addEventListener( 'start', () => ( controls.autoRotate = false ) );
const timer = new THREE.Timer();
timer.connect( document );
let t0 = - 1;
renderer.setAnimationLoop( () => {

	timer.update();
	if ( t0 < 0 ) t0 = timer.getElapsed();
	revealT.value = Math.min( 40, ( timer.getElapsed() - t0 ) * 1.7 ); // the reveal runs about 8 s, then holds
	statue.updateVersion();
	ground.updateVersion();
	controls.update( Math.min( timer.getDelta(), 0.05 ) );
	renderer.render( scene, camera );

} );
window.RESTART = () => ( t0 = - 1 );
window.EXAMPLE = { renderer, scene, camera, ready: true };
