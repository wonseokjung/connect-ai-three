// Shader worlds: four things drawn by shaders, side by side. A spiral galaxy, a stormy sea, a planet with day, night
// and clouds, and a candle flame. No image files: every pixel is computed on the graphics card (TSL, WebGPU).
//
// Adapted from the official three.js examples (MIT): webgpu_tsl_galaxy, webgpu_tsl_raging_sea, webgpu_tsl_earth and
// webgpu_tsl_vfx_flames. Changes: the Earth example's photo textures (CC BY) are replaced by procedural continents,
// clouds and city lights from MaterialX noise; the flame's noise images are replaced by mx_worley / mx_noise nodes.
// Click a panel to see it full screen, click again to go back.
import * as THREE from 'three/webgpu';
import {
	color, cos, float, mix, range, sin, time, uniform, uv, vec2, vec3, vec4, TWO_PI, Fn, Loop, mul, positionLocal, positionWorld,
	transformNormalToView, mx_noise_float, mx_noise_vec3, mx_fractal_noise_float, mx_worley_noise_float, normalWorldGeometry,
	normalize, cameraPosition, output, spherizeUV, oneMinus, step, billboarding, max, texture as textureNode,
} from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGPURenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setScissorTest( true );
document.body.appendChild( renderer.domElement );
await renderer.init();

const panels = [];
function panel( name, scene, camera, target ) {

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.target.copy( target );
	controls.enabled = false;
	controls.update();
	panels.push( { name, scene, camera, controls } );

}

// ---------- 1. galaxy (webgpu_tsl_galaxy) ----------
{

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x0b0716 );
	const material = new THREE.SpriteNodeMaterial( { depthWrite: false, blending: THREE.AdditiveBlending } );
	material.scaleNode = range( 0, 1 ).mul( 0.07 );
	const radiusRatio = range( 0, 1 );
	const radius = radiusRatio.pow( 1.5 ).mul( 5 ).toVar();
	const branches = 4;
	const branchAngle = range( 0, branches ).floor().mul( TWO_PI.div( branches ) );
	const angle = branchAngle.add( time.mul( 0.6 ).mul( radiusRatio.oneMinus() ) );
	const position = vec3( cos( angle ), 0, sin( angle ) ).mul( radius );
	const randomOffset = range( vec3( - 1 ), vec3( 1 ) ).pow3().mul( radiusRatio ).add( 0.2 );
	material.positionNode = position.add( randomOffset );
	const inside = color( '#ffb27a' ), outside = color( '#3b1fd1' );
	const colorFinal = mix( inside, outside, radiusRatio.oneMinus().pow( 2 ).oneMinus() );
	const alpha = float( 0.1 ).div( uv().sub( 0.5 ).length() ).sub( 0.2 );
	material.colorNode = vec4( colorFinal, alpha );
	scene.add( new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ), material, 40000 ) );
	// a sprinkle of far stars
	const stars = new THREE.SpriteNodeMaterial( { depthWrite: false, blending: THREE.AdditiveBlending } );
	stars.positionNode = range( vec3( - 40 ), vec3( 40 ) );
	stars.scaleNode = range( 0.02, 0.09 );
	stars.colorNode = vec4( vec3( 0.8, 0.85, 1 ), float( 0.06 ).div( uv().sub( 0.5 ).length() ).sub( 0.12 ) );
	scene.add( new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ), stars, 3000 ) );
	const camera = new THREE.PerspectiveCamera( 50, 1, 0.1, 200 );
	camera.position.set( 4.2, 2.6, 5.2 );
	panel( 'Galaxy', scene, camera, new THREE.Vector3( 0, - 0.3, 0 ) );

}

// ---------- 2. stormy sea (webgpu_tsl_raging_sea) ----------
{

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x140a24 );
	scene.fog = new THREE.Fog( 0x140a24, 2.2, 4.2 );
	const light = new THREE.DirectionalLight( '#ffffff', 3 );
	light.position.set( - 4, 2, 0 );
	scene.add( light );
	const material = new THREE.MeshStandardNodeMaterial( { color: '#271442', roughness: 0.15 } );
	const wavesElevation = Fn( ( [ p ] ) => {

		const elevation = mul( sin( p.x.mul( 3 ).add( time.mul( 1.25 ) ) ), sin( p.z.mul( 1 ).add( time.mul( 1.25 ) ) ), 0.15 ).toVar();
		Loop( { start: float( 1 ), end: float( 4 ) }, ( { i } ) => {

			const n = vec3( p.xz.add( 2 ).mul( 2 ).mul( i ), time.mul( 0.3 ) );
			elevation.subAssign( mx_noise_float( n, 1, 0 ).mul( 0.18 ).div( i ).abs() );

		} );
		return elevation;

	} );
	const elevation = wavesElevation( positionLocal );
	const pos = positionLocal.add( vec3( 0, elevation, 0 ) );
	material.positionNode = pos;
	const shift = float( 0.01 );
	let a = positionLocal.add( vec3( shift, 0, 0 ) );
	let b = positionLocal.add( vec3( 0, 0, shift.negate() ) );
	a = a.add( vec3( 0, wavesElevation( a ), 0 ) );
	b = b.add( vec3( 0, wavesElevation( b ), 0 ) );
	material.normalNode = transformNormalToView( a.sub( pos ).normalize().cross( b.sub( pos ).normalize() ) );
	material.emissiveNode = color( '#ff0a81' ).mul( elevation.remap( 0.2, - 0.25 ).pow( 7 ) );
	const geometry = new THREE.PlaneGeometry( 4, 4, 384, 384 );
	geometry.rotateX( - Math.PI / 2 );
	scene.add( new THREE.Mesh( geometry, material ) );
	const camera = new THREE.PerspectiveCamera( 50, 1, 0.05, 20 );
	camera.position.set( 1.25, 0.9, 1.25 );
	panel( 'Sea', scene, camera, new THREE.Vector3( 0, - 0.25, 0 ) );

}

// ---------- 3. planet (webgpu_tsl_earth, with procedural surfaces instead of photo maps) ----------
{

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x000000 );
	const sun = new THREE.DirectionalLight( '#ffffff', 2.2 );
	sun.position.set( 0, 0.4, 3 );
	scene.add( sun );
	const dayColor = color( '#4db2ff' ), twilight = color( '#bc490b' );
	const viewDirection = positionWorld.sub( cameraPosition ).normalize();
	const fresnel = viewDirection.dot( normalWorldGeometry ).abs().oneMinus().toVar();
	const sunOrientation = normalWorldGeometry.dot( normalize( sun.position ) ).toVar();
	const atmosphereColor = mix( twilight, dayColor, sunOrientation.smoothstep( - 0.25, 0.75 ) );

	const p = positionLocal.normalize();
	const continents = mx_fractal_noise_float( p.mul( 1.6 ), 6, 2.0, 0.5 ).toVar();
	const land = continents.smoothstep( 0.02, 0.06 ).toVar();
	const detail = mx_fractal_noise_float( p.mul( 9 ), 4, 2.0, 0.5 );
	const latitude = p.y.abs();
	const ocean = mix( color( '#08224f' ), color( '#145a9c' ), continents.remap( - 0.4, 0.04 ).clamp() );
	const ground = mix( mix( color( '#2f6b2a' ), color( '#9a8150' ), detail.add( 0.5 ).clamp() ), color( '#c9b48a' ), latitude.smoothstep( 0.35, 0.05 ).mul( 0.4 ) );
	const ice = latitude.smoothstep( 0.78, 0.86 );
	const clouds = mx_fractal_noise_float( p.mul( 3.2 ).add( vec3( time.mul( 0.02 ), 0, 0 ) ), 5, 2.0, 0.55 ).smoothstep( 0.05, 0.45 ).toVar();
	const surface = mix( mix( ocean, ground, land ), color( '#f2f6ff' ), ice );
	const material = new THREE.MeshStandardNodeMaterial();
	material.colorNode = mix( surface, vec3( 1 ), clouds.mul( 0.95 ) );
	material.roughnessNode = mix( float( 0.32 ), float( 0.9 ), max( land, clouds ) );
	// city lights: only on land, only away from the poles, only on the night side
	const cities = mx_noise_float( p.mul( 60 ) ).mul( mx_noise_float( p.mul( 7 ) ).add( 0.3 ) ).smoothstep( 0.18, 0.4 ).mul( land ).mul( latitude.smoothstep( 0.7, 0.4 ) ).mul( clouds.oneMinus() );
	const night = color( '#ffb35c' ).mul( cities ).mul( 2.5 );
	const dayStrength = sunOrientation.smoothstep( - 0.25, 0.5 );
	const atmosphereMix = sunOrientation.smoothstep( - 0.5, 1 ).mul( fresnel.pow( 2 ) ).clamp( 0, 1 );
	let finalOutput = mix( night, output.rgb, dayStrength );
	finalOutput = mix( finalOutput, atmosphereColor, atmosphereMix );
	material.outputNode = vec4( finalOutput, output.a );
	const sphere = new THREE.SphereGeometry( 1, 128, 128 );
	const globe = new THREE.Mesh( sphere, material );
	globe.name = 'globe';
	scene.add( globe );
	const atmosphereMaterial = new THREE.MeshBasicNodeMaterial( { side: THREE.BackSide, transparent: true } );
	atmosphereMaterial.outputNode = vec4( atmosphereColor, fresnel.remap( 0.73, 1, 1, 0 ).pow( 3 ).mul( sunOrientation.smoothstep( - 0.5, 1 ) ) );
	const atmosphere = new THREE.Mesh( sphere, atmosphereMaterial );
	atmosphere.scale.setScalar( 1.04 );
	scene.add( atmosphere );
	// stars
	const stars = new THREE.SpriteNodeMaterial( { depthWrite: false, blending: THREE.AdditiveBlending } );
	stars.positionNode = range( vec3( - 1 ), vec3( 1 ) ).normalize().mul( 40 );
	stars.scaleNode = range( 0.03, 0.12 );
	stars.colorNode = vec4( vec3( 1 ), float( 0.05 ).div( uv().sub( 0.5 ).length() ).sub( 0.1 ) );
	scene.add( new THREE.InstancedMesh( new THREE.PlaneGeometry( 1, 1 ), stars, 2000 ) );
	const camera = new THREE.PerspectiveCamera( 25, 1, 0.1, 100 );
	camera.position.set( 4.5, 1.4, 3 );
	panel( 'Planet', scene, camera, new THREE.Vector3( 0, 0, 0 ) );

}

// ---------- 4. flames (webgpu_tsl_vfx_flames, procedural noise instead of noise images) ----------
{

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x1a0f12 );
	const gradientCanvas = document.createElement( 'canvas' );
	gradientCanvas.width = 128; gradientCanvas.height = 1;
	const g = gradientCanvas.getContext( '2d' );
	const fill = g.createLinearGradient( 0, 0, 128, 0 );
	[ '#090033', '#5f1f93', '#e02e96', '#ffbd80', '#fff0db' ].forEach( ( c, i, a ) => fill.addColorStop( i / ( a.length - 1 ), c ) );
	g.fillStyle = fill;
	g.fillRect( 0, 0, 128, 1 );
	const gradient = new THREE.CanvasTexture( gradientCanvas );
	gradient.colorSpace = THREE.SRGBColorSpace;
	const cellular = ( q ) => mx_worley_noise_float( vec3( q.mul( 5 ), 0 ) ).clamp( 0, 1 );
	const perlin = ( q ) => mx_noise_vec3( vec3( q.mul( 4 ), 0.5 ) ).mul( 0.5 ).add( 0.5 );

	const flame1 = new THREE.SpriteNodeMaterial( { side: THREE.DoubleSide, transparent: true, depthWrite: false } );
	flame1.colorNode = Fn( () => {

		const mainUv = uv().toVar();
		mainUv.assign( spherizeUV( mainUv, 10 ).mul( 0.6 ).add( 0.2 ) );
		mainUv.assign( mainUv.pow( vec2( 1, 2 ) ) );
		mainUv.assign( mainUv.mul( 2, 1 ).sub( vec2( 0.5, 0 ) ) );
		const gradient1 = sin( time.mul( 10 ).sub( mainUv.y.mul( TWO_PI ).mul( 2 ) ) ).toVar();
		const gradient2 = mainUv.y.smoothstep( 0, 1 ).toVar();
		mainUv.x.addAssign( gradient1.mul( gradient2 ).mul( 0.2 ) );
		const cellularUv = mainUv.mul( 0.5 ).add( vec2( 0, time.negate().mul( 0.5 ) ) );
		const cellularNoise = cellular( cellularUv ).oneMinus().smoothstep( 0, 0.5 ).oneMinus().mul( gradient2 );
		const shape = mainUv.sub( 0.5 ).mul( vec2( 3, 2 ) ).length().oneMinus().toVar();
		shape.assign( shape.sub( cellularNoise ) );
		const gradientColor = textureNode( gradient, vec2( shape, 0 ) );
		return vec4( mix( gradientColor.rgb, vec3( 1 ), shape.step( 0.8 ) ), shape.smoothstep( 0, 0.3 ) );

	} )();
	const flame2 = new THREE.SpriteNodeMaterial( { side: THREE.DoubleSide, transparent: true, depthWrite: false } );
	flame2.colorNode = Fn( () => {

		const mainUv = uv().toVar();
		mainUv.assign( spherizeUV( mainUv, 10 ).mul( 0.6 ).add( 0.2 ) );
		mainUv.assign( mainUv.abs().pow( vec2( 1, 3 ) ).mul( mainUv.sign() ) );
		mainUv.assign( mainUv.mul( 2, 1 ).sub( vec2( 0.5, 0 ) ) );
		const perlinNoise = perlin( mainUv.add( vec2( 0, time.negate() ) ) ).sub( 0.5 );
		mainUv.x.addAssign( perlinNoise.x.mul( 0.5 ) );
		const gradient1 = sin( time.mul( 10 ).sub( mainUv.y.mul( TWO_PI ).mul( 2 ) ) );
		const gradient2 = mainUv.y.smoothstep( 0, 1 );
		const gradient3 = oneMinus( mainUv.y ).smoothstep( 0, 0.3 );
		mainUv.x.addAssign( gradient1.mul( gradient2 ).mul( 0.2 ) );
		const displacement = perlin( mainUv.mul( 0.5 ).add( vec2( 0, time.negate().mul( 0.25 ) ) ) ).sub( 0.5 );
		const displaced = perlin( mainUv.add( vec2( 0, time.negate().mul( 0.5 ) ) ).add( displacement.xy ) ).sub( 0.5 );
		mainUv.x.addAssign( displaced.x.mul( 0.5 ) );
		const cellularNoise = cellular( mainUv.add( vec2( 0, time.negate().mul( 1.5 ) ) ) ).oneMinus().smoothstep( 0.25, 1 );
		const shape = step( mainUv.sub( 0.5 ).mul( vec2( 6, 1 ) ).length(), 0.5 ).toVar();
		shape.assign( shape.mul( cellularNoise ).mul( gradient3 ) );
		return vec4( color( '#ffd9a8' ), step( 0.01, shape ) );

	} )();
	flame1.vertexNode = billboarding( { horizontalRotation: true } );
	flame2.vertexNode = billboarding( { horizontalRotation: true } );
	const f1 = new THREE.Sprite( flame1 );
	f1.position.y = 0.66; // billboarding() ignores sprite.center, so lift the flame by half its height
	f1.scale.set( 0.75, 1.3, 1 );
	f1.position.x = - 0.45;
	const f2 = new THREE.Sprite( flame2 );
	f2.position.y = 0.66;
	f2.scale.set( 1.0, 1.3, 1 );
	f2.position.x = 0.45;
	scene.add( f1, f2 );
	// a warm pool of light on the ground under the flames
	const pool = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } );
	pool.colorNode = vec4( color( '#ff7a3d' ), uv().sub( 0.5 ).length().mul( 2 ).oneMinus().clamp().pow( 2.2 ).mul( 0.5 ) );
	const ground = new THREE.Mesh( new THREE.PlaneGeometry( 3, 3 ), pool );
	ground.rotation.x = - Math.PI / 2;
	scene.add( ground );
	const camera = new THREE.PerspectiveCamera( 25, 1, 0.1, 100 );
	camera.position.set( 0.3, 1.0, 2.9 );
	panel( 'Flame', scene, camera, new THREE.Vector3( 0, 0.62, 0 ) );

}

// ---------- layout: a 2 x 2 grid, or one panel full screen ----------
const labels = panels.map( ( p ) => {

	const el = document.createElement( 'div' );
	el.className = 'label';
	el.dataset.keep = '';
	el.textContent = p.name;
	document.body.appendChild( el );
	return el;

} );
let solo = - 1;
function rects() {

	const W = window.innerWidth, H = window.innerHeight, gap = 4;
	if ( solo >= 0 ) return panels.map( ( _, i ) => ( i === solo ? { x: 0, y: 0, w: W, h: H } : null ) );
	const w = ( W - gap ) / 2, h = ( H - gap ) / 2;
	return [ { x: 0, y: 0, w, h }, { x: w + gap, y: 0, w, h }, { x: 0, y: h + gap, w, h }, { x: w + gap, y: h + gap, w, h } ];

}
renderer.domElement.addEventListener( 'click', ( e ) => {

	if ( solo >= 0 ) solo = - 1;
	else solo = ( e.clientX > window.innerWidth / 2 ? 1 : 0 ) + ( e.clientY > window.innerHeight / 2 ? 2 : 0 );
	layout();

} );
function layout() {

	const r = rects();
	panels.forEach( ( p, i ) => {

		const R = r[ i ];
		p.controls.enabled = !! R && solo === i;
		labels[ i ].style.display = R ? 'block' : 'none';
		if ( ! R ) return;
		p.camera.aspect = R.w / R.h;
		p.camera.updateProjectionMatrix();
		labels[ i ].style.left = R.x + 14 + 'px';
		labels[ i ].style.top = R.y + 12 + 'px';

	} );

}
window.addEventListener( 'resize', () => {

	renderer.setSize( window.innerWidth, window.innerHeight );
	layout();

} );
layout();

const timer = new THREE.Timer();
timer.connect( document );
function animate() {

	timer.update();
	const t = timer.getElapsed();
	const r = rects();
	const H = window.innerHeight;
	renderer.setClearColor( 0x000000 );
	renderer.setScissor( 0, 0, window.innerWidth, H );
	renderer.setViewport( 0, 0, window.innerWidth, H );
	renderer.clear();
	panels.forEach( ( p, i ) => {

		const R = r[ i ];
		if ( ! R ) return;
		if ( p.name === 'Planet' ) p.scene.getObjectByName( 'globe' ).rotation.y = t * 0.06;
		if ( solo !== i ) {

			// each panel drifts slowly on its own until you open it
			const sph = new THREE.Spherical().setFromVector3( p.camera.position.clone().sub( p.controls.target ) );
			sph.theta += 0.0016;
			p.camera.position.setFromSpherical( sph ).add( p.controls.target );
			p.camera.lookAt( p.controls.target );

		} else p.controls.update();
		// WebGPURenderer counts viewports from the top left
		renderer.setViewport( R.x, R.y, R.w, R.h );
		renderer.setScissor( R.x, R.y, R.w, R.h );
		renderer.render( p.scene, p.camera );

	} );

}
renderer.setAnimationLoop( animate );
window.EXAMPLE = { renderer, panels, ready: true };
