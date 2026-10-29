import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const text=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const icon=await text('android/res/drawable/ic_launcher.xml');
const native=await text('android/src/ru/courier/finance/MainActivity.java');
const splash=await text('web/index.html');
const css=await text('web/style.css');
const v31=await text('android/res/values-v31/styles.xml');

test('launcher keeps the SHIFT CONTROL four-arm mark and three established pigment colors on black',()=>{
 assert.match(icon,/android:fillColor="#10151a"/);
 for(const fill of ['#f4f1e9','#ff7952','#ffbd57'])assert.ok(icon.includes('android:color="'+fill+'"'),fill);
 const mark='M17,42 H28 C40,42 42,31 42,17 H54 V28 C54,45 45,54 28,54 H17 Z';
 assert.equal((icon.match(/M17,42 H28 C40,42 42,31 42,17 H54 V28 C54,45 45,54 28,54 H17 Z/g)||[]).length,4);
 assert.doesNotMatch(icon,/H100 V7 H0/,'old promotional stripe is not part of the floating mark');
});
test('native loading overlay and Android 12 splash use the exact same sign without changing UI theme',async()=>{
 const mark=await text('android/res/drawable/ic_brand_mark.xml');
 assert.match(mark,/android:color="#f4f1e9"/);
 assert.match(mark,/android:color="#ff7952"/);
 assert.match(mark,/android:color="#ffbd57"/);
 assert.match(mark,/android:rotation="270"/);
 assert.match(native,/icon\.setImageResource\(R\.drawable\.ic_brand_mark\)/);
 assert.doesNotMatch(native,/label\.setText\("ДОХОД\\nКУРЬЕРА"\)/);
 assert.match(native,/layout\.setBackgroundColor\(0xFF10151A\)/);
 assert.match(v31,/android:windowSplashScreenAnimatedIcon">\@drawable\/ic_brand_mark/);
 assert.match(v31,/android:windowSplashScreenBackground">#10151a/);
 assert.match(native,/root\.removeView\(launch\)/,'launch overlay is still removed when the app is ready');
});
test('web fallback remains a centered floating SHIFT CONTROL glyph without text or rainbow gradients',()=>{
 assert.match(splash,/<svg class="splash-mark"/);
 assert.doesNotMatch(splash,/<h1>Доход<br>курьера<\/h1>/);
 const original='M17 42H28C40 42 42 31 42 17H54V28C54 45 45 54 28 54H17Z';
 assert.equal((splash.match(new RegExp(original,'g'))||[]).length,4);
 assert.match(css,/\.splash\{[^}]*background:#10151a/);
 assert.match(css,/\.splash-mark\{[^}]*width:clamp/);
 assert.doesNotMatch(css.slice(css.lastIndexOf('/* Splash brand')),/#(?:ff00ff|00ffff|ac36ff)/i);
});

test('all four original Android vector paths use an actual multi-stop smooth SHIFT CONTROL gradient', async()=>{
 const mark=await text('android/res/drawable/ic_brand_mark.xml');
 for(const src of [icon,mark]) {
  assert.match(src,/xmlns:aapt="http:\/\/schemas.android.com\/aapt"/);
  assert.equal((src.match(/<aapt:attr name="android:fillColor">/g)||[]).length,4,'every arm has a gradient, not a flat fill');
  assert.equal((src.match(/<gradient android:type="linear"/g)||[]).length,4,'four native gradients, no flat color arms');
  for(const stop of ['#ff7952','#ffbd57','#f4f1e9']) {
   assert.ok(src.includes('android:color="'+stop+'"'),stop);
  }
  assert.equal((src.match(/android:pathData="M17,42 H28 C40,42 42,31 42,17 H54 V28 C54,45 45,54 28,54 H17 Z"/g)||[]).length,4);
 }
 assert.match(splash,/<linearGradient id="shiftBrand"/);
 assert.match(splash,/gradientUnits="userSpaceOnUse"/);
 assert.equal((splash.match(/fill="url\(#shiftBrand\)"/g)||[]).length,4);
});
