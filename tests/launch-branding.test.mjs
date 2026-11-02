import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const text=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const bytes=path=>readFile(new URL('../'+path,import.meta.url));
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const manifest=await text('android/AndroidManifest.xml');
const native=await text('android/src/ru/courier/finance/MainActivity.java');
const v31=await text('android/res/values-v31/styles.xml');
const html=await text('web/index.html');
const app=await text('web/app.mjs');
const css=await text('web/style.css');
const launcher=await bytes('android/res/drawable-nodpi/approved_launcher.png');
const mark=await bytes('android/res/drawable-nodpi/approved_mark.png');
const webMark=await bytes('web/brand_mark.png');
const portrait=await bytes('web/brand_splash.jpg');
const iconVector=await text('android/res/drawable/ic_launcher.xml');
const splashVector=await text('android/res/drawable/ic_brand_mark.xml');

test('the staircase reference is the Android launcher mark and its vector counterpart',()=>{
 assert.match(manifest,/android:icon="@drawable\/approved_launcher"/);
 assert.equal(launcher.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.deepEqual([launcher.readUInt32BE(16),launcher.readUInt32BE(20)],[512,512]);
 assert.equal(digest(launcher),'29e0c3aa7f5d89f604ce2da341d6c47454ed4af2dec46d8d4432d9fca93ee91d');
 assert.equal(webMark.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.deepEqual([webMark.readUInt32BE(16),webMark.readUInt32BE(20)],[512,512]);
 assert.equal(digest(webMark),digest(mark));
 assert.match(app,/src="brand_mark\.png"/);
 assert.match(iconVector,/M88,88 H424 V102 H102 V424 H88 Z/);
 assert.match(iconVector,/M372,372 H430 V430 H372 Z/);
});
test('Android 12 system splash and native launch overlay use the same staircase mark',()=>{
 assert.match(v31,/android:windowSplashScreenAnimatedIcon">@drawable\/approved_mark/);
 assert.match(v31,/android:windowSplashScreenBackground">#10151a/);
 assert.match(native,/setImageResource\(R\.drawable\.approved_mark\)/);
 assert.match(native,/layout\.setBackgroundColor\(0xFF10151A\)/);
 assert.match(native,/root\.removeView\(launch\)/);
 assert.equal(mark.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.deepEqual([mark.readUInt32BE(16),mark.readUInt32BE(20)],[512,512]);
 assert.equal(digest(mark),'4e076781c79f93ceb3f4600040ec79ec110b36e5c7030d5fc9e275c94b76702f');
 assert.match(splashVector,/M372,372 H430 V430 H372 Z/);
});
test('web startup uses the new quiet SHIFT CONTROL staircase lockup',()=>{
 assert.match(html,/<img class="splash-art" src="brand_splash.jpg"/);
 assert.doesNotMatch(html,/<svg class="splash-mark"/);
 assert.equal(portrait.subarray(0,3).toString('hex'),'ffd8ff');
 assert.equal(digest(portrait),'b41782170297eb1a35bbf56525ee9a6ad4dfa00b54a1ea538b5751674ba0cac0');
 assert.match(css,/\.splash\s+\.splash-art\{/);
 assert.match(css,/object-fit:cover/);
 assert.match(native,/path\.endsWith\("\.jpg"\) \? "image\/jpeg"/);
});
test('existing package, financial logic and dynamic appearance are unchanged by branding',()=>{
 assert.match(manifest,/package="ru\.courier\.finance"/);
 assert.match(native,/getSharedPreferences\("courier_finance", MODE_PRIVATE\)/);
 assert.match(native,/setTheme\(darkTheme \? R\.style\.AppThemeDark : R\.style\.AppThemeLight\)/);
});
