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
const css=await text('web/style.css');
const launcher=await bytes('android/res/drawable-nodpi/approved_launcher.png');
const mark=await bytes('android/res/drawable-nodpi/approved_mark.png');
const portrait=await bytes('web/brand_splash.jpg');

test('approved layered pearlescent icon is embedded as an actual image resource, not a flat vector approximation',()=>{
 assert.match(manifest,/android:icon="@drawable\/approved_launcher"/);
 assert.equal(launcher.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.deepEqual([launcher.readUInt32BE(16),launcher.readUInt32BE(20)],[512,512]);
 assert.equal(digest(launcher),'74396b61a9cc62f6898843673d6fee6f90dcc45b956fc5083ca4dbfe4657ca24');
});
test('Android 12 system icon and native launch overlay use the approved pearlescent mark',()=>{
 assert.match(v31,/android:windowSplashScreenAnimatedIcon">@drawable\/approved_mark/);
 assert.match(v31,/android:windowSplashScreenBackground">#10151a/);
 assert.match(native,/setImageResource\(R\.drawable\.approved_mark\)/);
 assert.match(native,/layout\.setBackgroundColor\(0xFF10151A\)/);
 assert.match(native,/root\.removeView\(launch\)/);
 assert.equal(mark.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.deepEqual([mark.readUInt32BE(16),mark.readUInt32BE(20)],[512,512]);
 assert.equal(digest(mark),'13ec9a78d10169862146b8dbc8ff004f4f67c49dd42dbf52c69082041dc43394');
});
test('web startup uses the owner-approved vertical layered-pearl artwork, not a flat gradient SVG',()=>{
 assert.match(html,/<img class="splash-art" src="brand_splash.jpg"/);
 assert.doesNotMatch(html,/<svg class="splash-mark"/);
 assert.equal(portrait.subarray(0,3).toString('hex'),'ffd8ff');
 assert.equal(digest(portrait),'f2608234928bbb3cc0065b2159b01a2b387a755c1c9c8a0454e958c31fdd3b38');
 assert.match(css,/\.splash\s+\.splash-art\{/);
 assert.match(css,/object-fit:cover/);
 assert.match(native,/path\.endsWith\("\.jpg"\) \? "image\/jpeg"/);
});
test('existing package, financial logic and dynamic appearance are unchanged by branding',()=>{
 assert.match(manifest,/package="ru\.courier\.finance"/);
 assert.match(native,/getSharedPreferences\("courier_finance", MODE_PRIVATE\)/);
 assert.match(native,/setTheme\(darkTheme \? R\.style\.AppThemeDark : R\.style\.AppThemeLight\)/);
});
