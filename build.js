// build.js — 把 holidays2026.js / scheduler.js / ui.js 內聯進 template，
// 產出可離線使用的單一 index.html。
//
// 作法：
//   1. 讀 src/index.template.html。
//   2. 逐檔移除 `import ...` 整行與行首 `export ` 關鍵字，使符號變成同一 <script>
//      作用域內的 top-level 宣告。
//   3. 移除三個 <script type="module" src=...> 標籤。
//   4. 在 </body> 前插入一個內聯 <script>（順序：holidays → scheduler → ui，
//      讓 ui 能呼叫前兩者）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');

const strip = (file) =>
  readFileSync(join(srcDir, file), 'utf8')
    // 移除整行 import（含 side-effect import / 具名 import / 多行不支援，本專案皆單行）。
    .replace(/^[ \t]*import[ \t][^\n]*\n/gm, '')
    // 移除行首 export 關鍵字（export function / export const ...）。
    .replace(/^([ \t]*)export[ \t]+/gm, '$1')
    .trim();

const files = ['holidays2026.js', 'scheduler.js', 'ui.js'];
const bundle = files
  .map((f) => `// ===== ${f} =====\n${strip(f)}`)
  .join('\n\n');

// 安全檢查：bundle 內不應再有 import/export 關鍵字（以詞界比對，避免誤判變數名）。
const leftover = bundle.match(/(^|[^.\w])(import|export)[ \t\n(]/);
if (leftover) {
  throw new Error(`bundle 仍殘留 ${leftover[2]} 關鍵字，內聯失敗`);
}

const tpl = readFileSync(join(srcDir, 'index.template.html'), 'utf8');
const html = tpl
  // 移除三個 module script 標籤（含後方空白）。
  .replace(/[ \t]*<script type="module"[^>]*><\/script>\s*/g, '')
  // 在 </body> 前插入內聯 bundle。
  .replace('</body>', `<script>\n${bundle}\n</script>\n</body>`);

writeFileSync(join(root, 'index.html'), html);
console.log('index.html 產出完成（', html.length, 'bytes ）');
