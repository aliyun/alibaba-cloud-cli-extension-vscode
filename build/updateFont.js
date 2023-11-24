const webfont = require('webfont');
const fs = require('fs');
const path = require('path');

const svgs = [
  "logo.svg"
].map(name => path.join(__dirname, '..', 'icons', name));

async function generateFont() {

  try {
    const result = await webfont.webfont({
      files: svgs,
      formats: ['woff'],
      startUnicode: 0xE000,
      verbose: true,
      normalize: true,
      sort: false
    });
    const dest = path.join(__dirname, '..', 'theme', 'aliyun-font.woff')
    fs.writeFileSync(dest, result.woff, 'binary');
    console.log(`Font created at ${dest}`);
  } catch (e) {
    console.error('Font creation failed.', e);
  }
}

generateFont();
