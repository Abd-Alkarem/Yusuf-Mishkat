const AdmZip = require('adm-zip');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'ithraa_template_v3.dotx');
const zip = new AdmZip(templatePath);
const entries = zip.getEntries();
const glossaryDoc = entries.find(e => e.entryName === 'word/glossary/document.xml');
const content = glossaryDoc.getData().toString('utf8');

// Check بسم entries for their actual content
const docParts = content.split(/(?=<w:docPart[ >])/g).filter(p => p.includes('<w:docPart'));
const targets = ['بسم1', 'بسم2', 'بسم3'];

docParts.forEach((part, i) => {
  const nameMatch = part.match(/<w:name w:val="([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : 'unknown';
  if (!targets.includes(name)) return;
  
  console.log(`\n========== ${name} ==========`);
  
  // Look for w:sym
  const syms = part.match(/<w:sym[^/]*\/>/g);
  if (syms) console.log('Symbols:', syms);
  
  // Look for drawings  
  if (part.includes('w:drawing')) console.log('Has DRAWING');
  if (part.includes('w:pict')) console.log('Has PICT');
  if (part.includes('v:shape')) console.log('Has VSHAPE');
  if (part.includes('w:object')) console.log('Has OBJECT');
  
  // Extract image references
  const imgRefs = part.match(/r:id="([^"]+)"/g);
  if (imgRefs) console.log('Image refs:', imgRefs);
  
  // Look for all runs
  const runs = part.match(/<w:r[ >][\s\S]*?<\/w:r>/g);
  if (runs) {
    runs.forEach((run, ri) => {
      const sym = run.match(/<w:sym w:font="([^"]*)" w:char="([^"]*)"/);
      const text = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
      const drawing = run.includes('w:drawing');
      const pict = run.includes('w:pict') || run.includes('v:shape');
      
      let info = `  Run ${ri}: `;
      if (sym) info += `SYM(font="${sym[1]}", char="${sym[2]}") `;
      if (text) info += `text="${text[1]}" `;
      if (drawing) info += 'DRAWING ';
      if (pict) info += 'PICT/SHAPE ';
      console.log(info);
    });
  }
});
