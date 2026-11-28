// Writes the community tables into README.md and README.ko.md from catalog/community.json and the examples'
// example.json files, so the words live in one place: the community examples grid and table (between
// <!-- community-examples:start --> and <!-- community-examples:end -->) and the library (<!-- library:start --> ...).
// Run: node tools/make-library-table.mjs
import fs from 'node:fs';
import path from 'node:path';
import {KIT} from '../lib/paths.mjs';
import {listExamples} from '../lib/examples.mjs';

const LIB = JSON.parse(fs.readFileSync(path.join(KIT, 'catalog', 'community.json'), 'utf8'));
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const ASSETS = {
  en: {none: 'code only', CC0: 'CC0', 'MIT-in-repo': 'MIT (in repo)', strip: 'some left out', check: 'to check'},
  ko: {none: '코드만', CC0: 'CC0', 'MIT-in-repo': 'MIT(저장소 안)', strip: '일부 빼고', check: '확인 필요'},
};
const stars = (n) => '★'.repeat(n || 1);

function tables(lang) {
  const ko = lang === 'ko';
  const num = (v) => (ko ? v.numbersKo || v.numbers : v.numbers);
  const code = LIB.filter((c) => c.kind === 'code');
  const prompts = LIB.filter((c) => c.kind === 'prompt');
  const cats = [...new Map(code.map((c) => [c.category, ko ? c.categoryKo : c.categoryTitle])).entries()];
  const L = [];
  L.push(ko
    ? `작품 ${code.length}개(코드) + 프롬프트 ${prompts.length}개. 라이선스는 GitHub 표시가 아니라 라이선스 본문을 읽어서 확인했어요(${code[0].verified}). 바이럴 숫자는 조사한 날(2026-11-28) 글이나 공개 바이럴 목록에서 확인한 값이에요. 영상 칸은 영상으로 찍었을 때 얼마나 좋은지 우리가 매긴 값이에요(★★★ 빛 · 움직임 · 카메라가 좋은 것, ★ 눌러 봐야 좋은 것).`
    : `${code.length} works with code + ${prompts.length} prompts. Licences were read from the licence text, not the GitHub label (${code[0].verified}). Viral numbers are what the post, or a public viral list, showed on the day we looked (2026-11-28). The video column is our rating of how good it looks filmed (★★★ light, motion and camera; ★ good only to click).`);
  L.push('');
  L.push(ko ? '| 분야 | 개수 | 예제로 실은 것 |' : '| category | works | shipped as examples |');
  L.push('|---|---|---|');
  for (const [k, title] of cats) {
    const items = code.filter((c) => c.category === k);
    L.push(`| ${title} | ${items.length} | ${items.filter((c) => c.example).map((c) => `[${c.example}](examples/${c.example})`).join(', ') || '-'} |`);
  }
  if (prompts.length) L.push(`| ${ko ? '프롬프트(코드 없음)' : 'prompts (no code)'} | ${prompts.length} | ${prompts.filter((c) => c.example).map((c) => `[${c.example}](examples/${c.example})`).join(', ') || '-'} |`);
  for (const [k, title] of cats) {
    L.push('');
    L.push(`<details><summary><b>${title}</b> (${code.filter((c) => c.category === k).length})</summary>`);
    L.push('');
    L.push(ko ? '| # | 작품 | 무엇 | 이렇게 말해요 | 바이럴 | 저장소 · 라이선스 | 에셋 | 영상 |' : '| # | work | what | say | viral | repo · licence | assets | video |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const c of code.filter((x) => x.category === k)) {
      const name = c.example ? `**[${cell(c.title)}](examples/${c.example})**` : cell(c.title);
      const viral = c.viral ? `[${cell(num(c.viral))}](${c.viral.url})` : '-';
      L.push(`| ${c.id} | ${name} | ${cell(ko ? c.whatKo : c.what)} | ${cell(ko ? c.sayKo : c.say)} | ${viral} | [${c.repo.replace('https://github.com/', '')}](${c.repo}) · ${c.license} | ${ASSETS[lang][c.assets]} | ${stars(c.videoFit)} |`);
    }
    L.push('');
    L.push('</details>');
  }
  if (prompts.length) {
    L.push('');
    L.push(`<details><summary><b>${ko ? '프롬프트: 코드는 안 열렸지만 만든 사람이 프롬프트를 공개한 것' : 'Prompts: no open code, but the author shared the prompt'}</b> (${prompts.length})</summary>`);
    L.push('');
    L.push(ko ? '우리는 이 코드나 모델을 가져오지 않아요. 공개된 프롬프트만 읽고, 우리 코드로 처음부터 새로 만들고, "inspired by" 로 출처를 적어요.' : 'We take no code, models, textures or sound from these. We read the shared prompt, write our own version from scratch and credit it as "inspired by".');
    L.push('');
    L.push(ko ? '| # | 작품 | 무엇 | 공개 프롬프트(줄임) | 바이럴 | 만든 사람 | 영상 |' : '| # | work | what | shared prompt (short) | viral | author | video |');
    L.push('|---|---|---|---|---|---|---|');
    for (const c of prompts) {
      const name = c.example ? `**[${cell(c.title)}](examples/${c.example})**` : cell(c.title);
      L.push(`| ${c.id} | ${name} | ${cell(ko ? c.whatKo : c.what)} | ${cell(c.prompt).slice(0, 160)}${c.prompt.length > 160 ? '…' : ''} | ${c.viral ? `[${cell(num(c.viral))}](${c.viral.url})` : `[post](${c.post})`} | ${cell(c.author)} | ${stars(c.videoFit)} |`);
    }
    L.push('');
    L.push('</details>');
  }
  return L.join('\n');
}

function communityExamples(lang) {
  const ko = lang === 'ko';
  const num = (v) => (ko ? v.numbersKo || v.numbers : v.numbers);
  const all = listExamples().filter((e) => e.community);
  const nn = (e) => String(e.section).padStart(2, '0');
  const L = ['<table>'];
  for (let i = 0; i < all.length; i += 3) {
    L.push('<tr>' + all.slice(i, i + 3).map((e) => `<td width="33%" valign="top"><a href="examples/${e.folder}"><img src="examples/${e.folder}/preview.jpg" alt="${ko ? e.titleKo : e.title}"></a><br><b>${nn(e)}</b> <a href="examples/${e.folder}">${ko ? e.titleKo : e.title}</a><br><sub>${e.community.kind === 'prompt' ? (ko ? '프롬프트에서 새로 만듦' : 'built from a shared prompt') + ' · ' : ''}${e.community.author}${e.community.viral ? ` · <a href="${e.community.viral.url}">${num(e.community.viral)}</a>` : ''}</sub></td>`).join('') + '</tr>');
  }
  L.push('</table>', '');
  L.push(ko ? '| | 예제 | 이렇게 말하면 이 영상이 나와요 | 원작 · 라이선스 |' : '| | example | say this, get this video | original · licence |');
  L.push('|---|---|---|---|');
  for (const e of all) {
    const c = e.community;
    const orig = c.kind === 'prompt' ? `${ko ? '영감' : 'inspired by'}: [${c.author}](${c.post || (c.viral && c.viral.url)}) · ${ko ? '우리 코드' : 'our code'}` : `[${c.repo.replace('https://github.com/', '')}](${c.repo}) · ${c.license}`;
    L.push(`| ${nn(e)} | [\`${e.name}\`](examples/${e.folder}) | ${cell(ko ? e.promptKo : e.prompt)} | ${orig} |`);
  }
  return L.join('\n');
}

for (const [f, lang] of [['README.md', 'en'], ['README.ko.md', 'ko']]) {
  const p = path.join(KIT, f);
  let md = fs.readFileSync(p, 'utf8');
  const ca = md.indexOf('<!-- community-examples:start -->'), cb = md.indexOf('<!-- community-examples:end -->');
  if (ca >= 0 && cb > ca) md = md.slice(0, ca) + '<!-- community-examples:start -->\n' + communityExamples(lang) + '\n' + md.slice(cb);
  const a = md.indexOf('<!-- library:start -->'), b = md.indexOf('<!-- library:end -->');
  if (a < 0 || b < 0) { console.log(`${f}: no <!-- library:start --> / <!-- library:end --> markers`); continue; }
  fs.writeFileSync(p, md.slice(0, a) + '<!-- library:start -->\n' + tables(lang) + '\n' + md.slice(b));
  console.log(`${f}: library table written`);
}
