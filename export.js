const fs = require('fs');
const { exec } = require('child_process');

function generatePDF(data) {
  const latexContent = `
    \\documentclass{article}
    \\usepackage[utf8]{inputenc}
    \\usepackage{geometry}
    \\geometry{a4paper, margin=1in}
    \\usepackage{hyperref}

    \\begin{document}

    \\section*{File QA Report}

    \\subsection*{Questions and Answers}
  `;
  data.forEach(item => {
    latexContent += `
      \\subsubsection*{Question: ${item.question}}
      \\paragraph{Answer: ${item.answer}}
      \\paragraph{File: ${item.file_path}}
      ${item.type.startsWith('image/') ? `\\paragraph{Image: Optimized Image Here}` : ''}
      ${!item.type.startsWith('image/') ? `\\paragraph{Link: \\href{http://example.com}{Click Here}}` : ''}
    `;
  });
  latexContent += '\\end{document}';

  fs.writeFileSync('report.tex', latexContent);
  exec('latexmk -pdf report.tex', (err) => {
    if (err) console.error(err);
    else console.log('PDF generated as report.pdf');
  });
}

module.exports = { generatePDF };