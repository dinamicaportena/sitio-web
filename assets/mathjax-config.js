// Misma configuración de MathJax que usa el archivo de charlas del sitio.
window.MathJax = {
  tex: {
    packages: {'[-]': ['html', 'require', 'autoload']},   // seguridad: sin \href, \style, \class, \cssId ni carga de extensiones
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
