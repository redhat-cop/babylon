import React, { ReactNode } from 'react';
import redHatLogo from '@app/bgimages/RedHat-Logo.svg';

import './footer.css';

const Footer: React.FC<{ rightElement?: ReactNode }> = ({ rightElement }) => (
  <section className="footer-component">
    <div className="footer__container">
      <div className="footer__left">
        <a href="https://www.redhat.com">
          <img src={redHatLogo} title="Red Hat" width={138} />
        </a>
      </div>
      <div id="legal" className="footer__legal">
        <div className="copyright">Copyright © 2022 Red Hat, Inc.</div>
        <div>
          <ul className="menu">
            <li className="first leaf">
              <a href="https://www.redhat.com/en/about/privacy-policy" target="_blank" rel="noreferrer">
                Privacy statement
              </a>
            </li>
            <li className="leaf">
              <a href="https://www.redhat.com/en/about/terms-use" target="_blank" rel="noreferrer">
                Terms of use
              </a>
            </li>
            <li className="leaf">
              <a href="https://www.redhat.com/en/about/all-policies-guidelines" target="_blank" rel="noreferrer">
                All policies and guidelines
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer__right">{rightElement ? rightElement : null}</div>
    </div>
  </section>
);

export default Footer;
