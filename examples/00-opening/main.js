// The opening: every other example in this folder plays here, one after another with hard cuts, live in your
// browser. Nothing is a video. The next example loads in a hidden frame and swaps in when it is ready.
// Click "Open this one" to go to the example on screen.
const SHOW = [
	[ '01-miniature-world', 'Miniature world' ], [ '02-glass-materials', 'Glass, rainbow, soap film' ], [ '03-neon-text', 'Neon text' ],
	[ '04-shader-worlds', 'Shaders' ], [ '05-particles', 'Particles' ], [ '06-physics', 'Real physics' ], [ '07-teardown', 'Machine teardown' ],
	[ '08-scroll-site', 'Scroll website' ], [ '09-many-styles', 'One scene, many styles' ], [ '10-flight-game', 'Flight game' ],
	[ '11-gaussian-splat', 'Gaussian splats' ], [ '12-xr', 'XR roller coaster' ],
];
const HOLD = 5000; // ms on screen per example
const frames = [ document.getElementById( 'a' ), document.getElementById( 'b' ) ];
const title = document.querySelector( '.title' );
let front = 0, index = 0, shownAt = 0;

function load( frame, i ) {

	return new Promise( ( ok ) => {

		frame.onload = () => setTimeout( ok, 1200 ); // give the scene a moment to draw its first frames
		frame.src = `../${SHOW[ i ][ 0 ]}/`;

	} );

}
function label( i ) {

	document.getElementById( 'num' ).textContent = `${String( i + 1 ).padStart( 2, '0' )} / ${SHOW.length}`;
	document.getElementById( 'name' ).textContent = SHOW[ i ][ 1 ];
	document.getElementById( 'open' ).href = `../${SHOW[ i ][ 0 ]}/`;

}

await load( frames[ 0 ], 0 );
label( 0 );
shownAt = performance.now();
setTimeout( () => ( title.style.opacity = 0 ), 3500 );
for ( ;; ) {

	const next = ( index + 1 ) % SHOW.length, back = 1 - front;
	await load( frames[ back ], next );
	const wait = HOLD - ( performance.now() - shownAt );
	if ( wait > 0 ) await new Promise( ( ok ) => setTimeout( ok, wait ) );
	// hard cut
	frames[ back ].classList.remove( 'wait' );
	frames[ front ].classList.add( 'wait' );
	frames[ front ].src = 'about:blank';
	front = back;
	index = next;
	label( index );
	shownAt = performance.now();

}
