// A V8 engine you can take apart: cut it open, follow one cylinder through its four strokes, change the speed, pick a
// camera view, drag to orbit. Left alone it plays a guided tour; click, drag or press a key to take over.
//
// This is the V8 simulator from elvarofficial/teardown (MIT, see LICENSE-teardown.txt), copied as it is:
// kit/ is the teardown kit (stage, HUD, director, warm-up), v8/ is the engine model, its kinematics and the live page.
// The engine is built from three.js geometry in code (no model file). Changes here: the page loads three.js through an
// import map instead of the esbuild bundle, and the fonts (Inter, JetBrains Mono, SIL OFL) are files in assets/fonts.
import { runLive } from './v8/live.js';

await document.fonts.load( '600 12px "JetBrains Mono"' ).catch( () => {} );
await document.fonts.load( '600 12px Inter' ).catch( () => {} );
runLive();

// the tests read the renderer from here
const wait = () => {

	if ( window.LIVE?.st ) {

		const st = window.LIVE.st;
		window.EXAMPLE = { renderer: st.renderer, scene: st.scene, camera: st.camera, ready: true };

	} else requestAnimationFrame( wait );

};
wait();
