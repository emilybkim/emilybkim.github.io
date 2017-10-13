$(function() {

  var header_wrapper = $(".header-wrapper");
  var header = $(".header-wrapper-two");

  header_wrapper.waypoint({
    handler: function(direction) {
      header.toggleClass('sticky', direction=='down');
      if (direction == 'down')
        header_wrapper.css({ 'height':header.outerHeight() });
      else
        header_wrapper.css({ 'height':'auto' });
      }
  });
  
  $(window).on('scroll', function() {
    var docViewTop = $(window).scrollTop();
	if (docViewTop >= 100) {
        $('.anchor').each(function(i) {
            if ($(this).position().top <= docViewTop + 100) {
                $('nav a.active').removeClass('active');
                $('nav a').eq(i).addClass('active');
            }
        });

    } 
   
    else {
        $('nav a.active').removeClass('active');
        $('nav a:first').addClass('active');
    }
    
    if ($('body').height() <= ($(window).height() + docViewTop)) {
        $('nav a.active').removeClass('active');
        $('nav a:last').addClass('active');
    }
  }).scroll();
  
  
  $('.anchor').click(function() {
    $('nav a').addClass('active');
  });
  
  
});


