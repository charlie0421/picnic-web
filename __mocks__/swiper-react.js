// Swiper React 컴포넌트 mock
const React = require('react');

// Swiper 컴포넌트 mock
const SwiperComponent = React.forwardRef(function Swiper({ children, ...props }, ref) {
  return React.createElement('div', { ref, 'data-testid': 'swiper', ...props }, children);
});

// SwiperSlide 컴포넌트 mock
const SwiperSlide = function({ children, ...props }) {
  return React.createElement('div', { 'data-testid': 'swiper-slide', ...props }, children);
};

// useSwiper hook mock
const useSwiper = function() {
  return {
    slideNext: jest.fn(),
    slidePrev: jest.fn(),
    slideTo: jest.fn(),
    activeIndex: 0,
    isBeginning: true,
    isEnd: false,
    destroy: jest.fn(),
  };
};

// useSwiperSlide hook mock
const useSwiperSlide = function() {
  return {
    isActive: false,
    isPrev: false,
    isNext: false,
    isVisible: true,
  };
};

module.exports = {
  Swiper: SwiperComponent,
  SwiperSlide: SwiperSlide,
  useSwiper: useSwiper,
  useSwiperSlide: useSwiperSlide,
};