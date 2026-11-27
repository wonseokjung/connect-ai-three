// Writes examples/<name>/README.md and examples/README.md from each example.json, so the words live in one place.
// Run: node tools/make-example-readmes.mjs
import fs from 'node:fs';
import path from 'node:path';
import {listExamples, EXAMPLES} from '../lib/examples.mjs';

const RUN = 'npx github:wonseokjung/connect-ai-three';
const src = (s) => `- ${s.url ? `[${s.name}](${s.url})` : s.name} (${s.license === 'own' ? 'made for this kit' : s.license}): ${s.what}`;
const all = listExamples();

for (const e of all) {
  const nn = String(e.section).padStart(2, '0');
  const md = `# ${nn} ${e.title}

![${e.title}](preview.jpg)

${e.about}

[preview.mp4](preview.mp4)

## Say this to your AI

> ${e.prompt}

## 한국어로는 이렇게 말해요

> ${e.promptKo}

${e.aboutKo}

## Run it

\`\`\`bash
${RUN} example ${e.name}
\`\`\`

Your own copy to change (three.js then comes from a pinned CDN, so any static server works):

\`\`\`bash
${RUN} example ${e.name} --copy my-${e.name}
\`\`\`
${e.name === 'opening' ? '\nThe opening plays the other examples, so it runs inside the kit only.\n' : ''}
## Where it comes from

${e.sources.map(src).join('\n')}
${e.replaces ? `\n${e.replaces}\n` : ''}
The full credits are in [NOTICE.md](../../NOTICE.md).
`;
  fs.writeFileSync(path.join(e.dir, 'README.md'), md);
}

const cell = (e) => `<a href="${e.folder}/"><img src="${e.folder}/preview.jpg" width="100%" alt="${e.title}"></a><br><b>${String(e.section).padStart(2, '0')} ${e.title}</b>`;
const rows = [];
for (let i = 0; i < all.length; i += 3) rows.push('<tr>' + all.slice(i, i + 3).map((e) => `<td width="33%" valign="top">${cell(e)}</td>`).join('') + '</tr>');
fs.writeFileSync(path.join(EXAMPLES, 'README.md'), `# Examples

${all.length} real three.js pages, one per lesson section. Each one started from MIT open source (the official three.js
examples and other projects named in its folder) and uses only CC0 models and textures.

<table>
${rows.join('\n')}
</table>

| | example | say this to your AI |
|---|---|---|
${all.map((e) => `| ${String(e.section).padStart(2, '0')} | [${e.name}](${e.folder}/) | ${e.prompt.replace(/\|/g, '/')} |`).join('\n')}

\`\`\`bash
${RUN} examples          # the list
${RUN} example physics   # open one
\`\`\`

The old scene.json examples (one file of JSON per scene, made into video) are in [scene-json/](scene-json/).
`);
console.log(`wrote ${all.length} READMEs + examples/README.md`);
