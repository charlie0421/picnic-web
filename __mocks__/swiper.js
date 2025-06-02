// Swiper 메인 모듈 mock
const SwiperMock = function(container, params) {
  this.el = container;
  this.params = params || {};
  this.slides = [];
  this.activeIndex = 0;
  this.isBeginning = true;
  this.isEnd = false;
  
  // Mock methods
  this.slideNext = jest.fn();
  this.slidePrev = jest.fn();
  this.slideTo = jest.fn();
  this.update = jest.fn();
  this.destroy = jest.fn();
  this.on = jest.fn();
  this.off = jest.fn();
  this.emit = jest.fn();
  
  return this;
};

// Static methods
SwiperMock.use = jest.fn();
SwiperMock.install = jest.fn();

// Navigation module mock
const Navigation = {
  name: 'navigation',
};

// Pagination module mock
const Pagination = {
  name: 'pagination',
};

// Scrollbar module mock
const Scrollbar = {
  name: 'scrollbar',
};

// Autoplay module mock
const Autoplay = {
  name: 'autoplay',
};

module.exports = {
  default: SwiperMock,
  Swiper: SwiperMock,
  Navigation: Navigation,
  Pagination: Pagination,
  Scrollbar: Scrollbar,
  Autoplay: Autoplay,
};