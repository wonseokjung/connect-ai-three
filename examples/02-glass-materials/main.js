// Glass, rainbow and soap film: three physical materials in one studio.
// - a cut crystal that splits light into colours (MeshPhysicalMaterial dispersion, from webgl_loader_gltf_dispersion)
// - thick glass with refraction (transmission + thickness + ior, from webgl_materials_physical_transmission)
// - soap bubbles with a thin film (iridescence, from webgl_loader_gltf_iridescence)
// - a real glTF model that uses all of it: Khronos "ToyCar" (CC0): clearcoat paint, sheen fabric, a glass dome
// Adapted from those official three.js examples (MIT). Their models (DispersionTest, IridescenceLamp) are CC BY and are
// not used; the crystal and bubbles are built in code, the light is a CC0 Poly Haven HDRI.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const timer = new THREE.Timer();
timer.connect( document );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 32, window.innerWidth / window.innerHeight, 0.05, 100 );
camera.position.set( 0, 1.35, 5.4 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0, 0.85, 0 );
controls.enableDamping = true;
controls.minDistance = 2.5;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.52;
controls.update();

// --- light: the HDRI for reflections, a blurred copy behind ---
const hdr = await new HDRLoader().loadAsync( 'assets/colorful_studio_1k.hdr' );
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = hdr;
scene.environmentIntensity = 1.0;
// a deep studio: dark gradient behind, so every highlight and rainbow edge reads
const bg = document.createElement( 'canvas' );
bg.width = 4; bg.height = 256;
const bgc = bg.getContext( '2d' );
const grad = bgc.createLinearGradient( 0, 0, 0, 256 );
grad.addColorStop( 0, '#1b1440' );
grad.addColorStop( 0.6, '#3a1f5c' );
grad.addColorStop( 1, '#0d0a1c' );
bgc.fillStyle = grad;
bgc.fillRect( 0, 0, 4, 256 );
scene.background = new THREE.CanvasTexture( bg );
scene.background.colorSpace = THREE.SRGBColorSpace;

const key = new THREE.DirectionalLight( 0xffffff, 1.6 );
key.position.set( 3, 6, 4 );
key.castShadow = true;
key.shadow.mapSize.set( 2048, 2048 );
key.shadow.radius = 6;
Object.assign( key.shadow.camera, { left: - 4, right: 4, top: 4, bottom: - 4 } );
scene.add( key );

// --- a curved backdrop with soft colour bands: what the glass bends and splits ---
function bandsTexture() {

	const c = document.createElement( 'canvas' );
	c.width = 2048; c.height = 64;
	const g = c.getContext( '2d' );
	const cols = [ '#ff5c9a', '#ffcf4a', '#3ee6b0', '#4aa8ff', '#b27bff' ];
	g.fillStyle = '#120d2a';
	g.fillRect( 0, 0, c.width, c.height );
	const n = 36;
	for ( let i = 0; i < n; i ++ ) {

		g.fillStyle = cols[ i % cols.length ];
		g.fillRect( ( i * c.width ) / n, 0, 10, c.height );

	}
	const t = new THREE.CanvasTexture( c );
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;

}
const backdropGeo = new THREE.CylinderGeometry( 7, 7, 8, 128, 1, true, - Math.PI * 0.4, Math.PI * 0.8 );
const backdrop = new THREE.Mesh( backdropGeo, new THREE.MeshBasicMaterial( { map: bandsTexture(), side: THREE.BackSide } ) );
backdrop.rotation.y = Math.PI;
backdrop.position.set( 0, 3.2, 1.5 );
// a few soft coloured lights in the room
for ( const [ c, x, z ] of [ [ 0xff4f9a, - 4, 1 ], [ 0x4f9aff, 4, 1 ], [ 0xffc04f, 0, - 4 ] ] ) {

	const p = new THREE.PointLight( c, 30, 12, 2 );
	p.position.set( x, 2.5, z );
	scene.add( p );

}
scene.add( backdrop );
const floor = new THREE.Mesh( new THREE.CircleGeometry( 9, 96 ), new THREE.MeshPhysicalMaterial( { color: 0x15102a, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 } ) );
floor.rotation.x = - Math.PI / 2;
floor.receiveShadow = true;
scene.add( floor );

// --- plinths ---
function plinth( x, z, h, r, color ) {

	const m = new THREE.Mesh( new THREE.CylinderGeometry( r, r * 1.02, h, 96 ), new THREE.MeshPhysicalMaterial( { color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 } ) );
	m.position.set( x, h / 2, z );
	m.castShadow = m.receiveShadow = true;
	scene.add( m );
	return h;

}
const midH = plinth( 0, 0, 0.42, 0.75, 0xf4f0ff );
const leftH = plinth( - 1.9, 0.5, 0.26, 0.58, 0xff8fb6 );
plinth( 1.9, 0.5, 0.16, 0.72, 0x8fb4ff );

// --- 1. the crystal: a brilliant cut, flat facets, dispersion splits the light into a rainbow ---
function brilliant( radius = 0.5 ) {

	// a round brilliant: table, crown, girdle, pavilion as a lathe with few segments -> facets
	const pts = [ [ 0, - 0.86 ], [ 0.98, - 0.02 ], [ 1.0, 0.04 ], [ 0.62, 0.38 ], [ 0.0, 0.38 ] ].map( ( [ x, y ] ) => new THREE.Vector2( x * radius, y * radius ) );
	const g = new THREE.LatheGeometry( pts, 16 ).toNonIndexed();
	g.computeVertexNormals();
	return g;

}
const crystalMat = new THREE.MeshPhysicalMaterial( {
	color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 1.2, ior: 2.2, dispersion: 6,
	specularIntensity: 1, envMapIntensity: 1.4, flatShading: true,
} );
const crystal = new THREE.Mesh( brilliant( 0.82 ), crystalMat );
crystal.position.set( 0, midH + 0.82 * 0.86 + 0.05, 0 );
crystal.castShadow = true;
scene.add( crystal );

// --- 2. thick glass orbs with colour inside (attenuation), refraction through ---
const orbs = [];
for ( const [ x, z, r, col ] of [ [ - 1.75, 0.35, 0.34, 0xff6f9c ], [ - 2.15, 0.85, 0.2, 0x7d6bff ], [ - 1.45, 0.82, 0.16, 0x33c9a0 ] ] ) {

	const m = new THREE.Mesh( new THREE.SphereGeometry( r, 96, 64 ), new THREE.MeshPhysicalMaterial( {
		color: 0xffffff, roughness: 0.02, transmission: 1, thickness: r * 2, ior: 1.5, attenuationColor: col, attenuationDistance: r * 4, envMapIntensity: 1.2,
	} ) );
	m.position.set( x, leftH + r, z );
	m.castShadow = true;
	scene.add( m );
	orbs.push( m );

}

// --- 3. soap bubbles: a thin film on a clear shell (iridescence) ---
const bubbleMat = new THREE.MeshPhysicalMaterial( {
	color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 0.02, ior: 1.33,
	iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 620, envMapIntensity: 1.6, specularIntensity: 1,
} );
const bubbles = [];
const rnd = ( a, b, i ) => a + ( b - a ) * ( ( Math.sin( i * 91.7 ) * 43758.5453 ) % 1 + 1 ) % 1;
for ( let i = 0; i < 9; i ++ ) {

	const r = rnd( 0.12, 0.34, i );
	const b = new THREE.Mesh( new THREE.SphereGeometry( r, 96, 64 ), bubbleMat );
	b.userData = { x: rnd( - 2.6, 2.6, i + 3 ), z: rnd( - 1.2, 0.9, i + 7 ), y0: rnd( 0.6, 2.8, i + 11 ), speed: rnd( 0.08, 0.2, i + 13 ), phase: rnd( 0, 6.28, i + 17 ) };
	scene.add( b );
	bubbles.push( b );

}

// --- 4. the Khronos ToyCar (CC0): clearcoat, sheen and a transmissive glass dome in one model ---
const gltf = await new GLTFLoader().loadAsync( 'assets/toy-car.glb' );
const car = gltf.scene;
const box = new THREE.Box3().setFromObject( car );
const size = box.getSize( new THREE.Vector3() );
car.scale.setScalar( 1.55 / Math.max( size.x, size.z ) );
box.setFromObject( car );
car.position.set( 1.9 - ( box.min.x + box.max.x ) / 2, 0.18 - box.min.y, 0.5 - ( box.min.z + box.max.z ) / 2 );
car.traverse( ( o ) => {

	if ( o.isMesh ) o.castShadow = o.receiveShadow = true;

} );
scene.add( car );

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

} );

let userMoved = false;
controls.addEventListener( 'start', () => ( userMoved = true ) );

function animate() {

	timer.update();
	const t = timer.getElapsed();
	crystal.rotation.y = t * 0.35;
	car.rotation.y = - 0.5 + Math.sin( t * 0.3 ) * 0.35;
	for ( const b of bubbles ) {

		const u = b.userData;
		b.position.set( u.x + Math.sin( t * 0.5 + u.phase ) * 0.25, u.y0 + ( ( t * u.speed + u.phase ) % 1 ) * 0.6 + Math.sin( t * 0.9 + u.phase ) * 0.08, u.z );

	}
	if ( ! userMoved ) {

		// a slow camera sway until you take over with the mouse
		const a = Math.sin( t * 0.22 ) * 0.42;
		camera.position.set( Math.sin( a ) * 5.4, 1.35 + Math.sin( t * 0.17 ) * 0.2, Math.cos( a ) * 5.4 );

	}
	controls.update();
	renderer.render( scene, camera );

}
renderer.setAnimationLoop( animate );
window.EXAMPLE = { renderer, scene, camera, ready: true };
