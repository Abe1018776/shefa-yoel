import AdmZip from "adm-zip";

const file = process.argv[2] || "C:\\Users\\chezk\\Downloads\\שער התורה - פרק ב החדש.docx";
const zip = new AdmZip(file);
const docXml = zip.readAsText("word/document.xml");

function getTextFromXml(xml) {
  const texts = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) texts.push(match[1]);
  return texts.join("");
}

const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
let pMatch;
let i = 0;
while ((pMatch = pRegex.exec(docXml)) !== null) {
  const pXml = pMatch[0];
  const text = getTextFromXml(pXml).trim();
  if (!text) continue;
  i++;

  const styleMatch = pXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
  const style = styleMatch ? styleMatch[1] : "(none)";
  const hasBold = /<w:b[\s/>]/.test(pXml);
  const szMatch = pXml.match(/<w:sz\s+w:val="(\d+)"/);
  const fontSize = szMatch ? parseInt(szMatch[1]) / 2 : 0;
  const alignMatch = pXml.match(/<w:jc\s+w:val="([^"]+)"/);
  const align = alignMatch ? alignMatch[1] : "";
  const fnRefs = (pXml.match(/<w:footnoteReference/g) || []).length;

  console.log(`${i}. [${style}] bold=${hasBold} size=${fontSize} align=${align} fn=${fnRefs} | "${text.slice(0, 80)}"`);

  if (i >= 160) { console.log("..."); break; }
}
