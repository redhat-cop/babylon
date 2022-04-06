import * as React from 'react';
import App from '@app/index';
import { mount, shallow } from 'enzyme';
import { Button } from '@patternfly/react-core';
import { Provider } from 'react-redux';
import { store } from '@app/store';

function AppWithReduxStore() {
  return (
    <Provider store={store}>
      <App />
    </Provider>
  );
}
describe('App tests', () => {
  test('should render default App component', () => {
    const view = shallow(<App />);
    expect(view).toMatchSnapshot();
  });

  it('should render a nav-toggle button', () => {
    const wrapper = mount(<AppWithReduxStore />);
    const button = wrapper.find(Button);
    expect(button.exists()).toBe(true);
  });

  it('should hide the sidebar on smaller viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });
    const wrapper = mount(<AppWithReduxStore />);
    window.dispatchEvent(new Event('resize'));
    expect(wrapper.find('#page-sidebar').hasClass('pf-m-collapsed')).toBeTruthy();
  });

  it('should expand the sidebar on larger viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
    const wrapper = mount(<AppWithReduxStore />);
    window.dispatchEvent(new Event('resize'));
    expect(wrapper.find('#page-sidebar').hasClass('pf-m-expanded')).toBeTruthy();
  });

  it('should hide the sidebar when clicking the nav-toggle button', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
    const wrapper = mount(<AppWithReduxStore />);
    window.dispatchEvent(new Event('resize'));
    const button = wrapper.find('#nav-toggle').hostNodes();
    expect(wrapper.find('#page-sidebar').hasClass('pf-m-expanded')).toBeTruthy();
    button.simulate('click');
    expect(wrapper.find('#page-sidebar').hasClass('pf-m-collapsed')).toBeTruthy();
    expect(wrapper.find('#page-sidebar').hasClass('pf-m-expanded')).toBeFalsy();
  });
});
