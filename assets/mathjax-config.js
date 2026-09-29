// Misma configuración de MathJax que usa el archivo de charlas del sitio.
window.MathJax = {
  tex: {
    inlineMath: [['$', '$']],
    macros: {
      Z: "{\\mathbb{Z}}", R: "{\\mathbb{R}}", N: "{\\mathbb{N}}",
      Q: "{\\mathbb{Q}}", C: "{\\mathbb{C}}", T: "{\\mathbb{T}}",
      mathsterling: "£", P: "{\\mathcal{P}}"
    }
  },
  svg: { fontCache: 'local' },
  startup: { typeset: false }
};
