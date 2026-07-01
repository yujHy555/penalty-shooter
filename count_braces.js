const fs = require('fs');
const code = fs.readFileSync('src/app/page.tsx', 'utf8');
let depth = 0;
let lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    l = l.replace(/\/\/.*$/, ''); // strip comments
    for (let c of l) {
        if (c === '{') depth++;
        if (c === '}') depth--;
    }
    if (i === 173 || i === 3250 || i === 3366) {
        console.log('Line ' + (i+1) + ' depth: ' + depth);
    }
}
console.log('Final depth: ' + depth);
