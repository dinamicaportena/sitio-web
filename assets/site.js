(function(){
  var btn = document.querySelector('.nav-toggle');
  var header = document.querySelector('header.site');
  if(!btn || !header) return;
  btn.addEventListener('click', function(){
    var open = header.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && header.classList.contains('nav-open')){
      header.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });
})();
