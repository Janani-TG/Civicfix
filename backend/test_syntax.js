const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let errors = 0;
function checkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            if (f !== 'node_modules' && f !== '.git') checkDir(full);
        } else if (f.endsWith('.js')) {
            try {
                execSync(`node --check "${full}"`);
                console.log(`[PASS] ${full}`);
            } catch (err) {
                console.error(`[FAIL] ${full}: ${err.message}`);
                errors++;
            }
        }
    }
}

checkDir(path.resolve(__dirname, '..', 'backend'));
checkDir(path.resolve(__dirname, '..', 'frontend'));

if (errors === 0) {
    console.log('\nAll JS files passed syntax validation!');
} else {
    console.error(`\nFound ${errors} syntax error(s).`);
}
