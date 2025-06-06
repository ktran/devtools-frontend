// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/* eslint-disable rulesdir/no-lit-render-outside-of-view */

import type * as Platform from '../../../core/platform/platform.js';
import {html, render} from '../../../ui/lit/lit.js';
import * as VisualElements from '../../visual_logging/visual_logging.js';

import adornerStyles from './adorner.css.js';

export interface AdornerData {
  name: string;
  content?: HTMLElement;
  jslogContext?: string;
}

export class Adorner extends HTMLElement {
  name = '';

  readonly #shadow = this.attachShadow({mode: 'open'});
  #isToggle = false;
  #ariaLabelDefault?: string;
  #ariaLabelActive?: string;
  #content?: HTMLElement;
  #jslogContext?: string;

  set data(data: AdornerData) {
    this.name = data.name;
    this.#jslogContext = data.jslogContext;
    if (data.content) {
      this.#content?.remove();
      this.append(data.content);
      this.#content = data.content;
    }
    this.#render();
  }

  override cloneNode(deep?: boolean): Node {
    const node = super.cloneNode(deep) as Adorner;
    node.data = {name: this.name, content: this.#content, jslogContext: this.#jslogContext};
    return node;
  }

  connectedCallback(): void {
    if (!this.getAttribute('aria-label')) {
      this.setAttribute('aria-label', this.name);
    }
    if (this.#jslogContext && !this.getAttribute('jslog')) {
      this.setAttribute('jslog', `${VisualElements.adorner(this.#jslogContext)}`);
    }
  }

  isActive(): boolean {
    return this.getAttribute('aria-pressed') === 'true';
  }

  /**
   * Toggle the active state of the adorner. Optionally pass `true` to force-set
   * an active state; pass `false` to force-set an inactive state.
   */
  toggle(forceActiveState?: boolean): void {
    if (!this.#isToggle) {
      return;
    }
    const shouldBecomeActive = forceActiveState === undefined ? !this.isActive() : forceActiveState;
    this.setAttribute('aria-pressed', Boolean(shouldBecomeActive).toString());
    this.setAttribute('aria-label', (shouldBecomeActive ? this.#ariaLabelActive : this.#ariaLabelDefault) || this.name);
  }

  show(): void {
    this.classList.remove('hidden');
  }

  hide(): void {
    this.classList.add('hidden');
  }

  /**
   * Make adorner interactive by responding to click events with the provided action
   * and simulating ARIA-capable toggle button behavior.
   */
  addInteraction(action: EventListener, options: {
    ariaLabelDefault: Platform.UIString.LocalizedString,
    ariaLabelActive: Platform.UIString.LocalizedString,
    isToggle?: boolean,
    shouldPropagateOnKeydown?: boolean,
  }): void {
    const {isToggle = false, shouldPropagateOnKeydown = false, ariaLabelDefault, ariaLabelActive} = options;

    this.#isToggle = isToggle;
    this.#ariaLabelDefault = ariaLabelDefault;
    this.#ariaLabelActive = ariaLabelActive;
    this.setAttribute('aria-label', ariaLabelDefault);
    if (this.#jslogContext) {
      this.setAttribute('jslog', `${VisualElements.adorner(this.#jslogContext).track({click: true})}`);
    }

    if (isToggle) {
      this.addEventListener('click', () => {
        this.toggle();
      });
      this.toggle(false /* initialize inactive state */);
    }

    this.addEventListener('click', action);

    // Simulate an ARIA-capable toggle button
    this.classList.add('clickable');
    this.setAttribute('role', 'button');
    this.tabIndex = 0;
    this.addEventListener('keydown', event => {
      if (event.code === 'Enter' || event.code === 'Space') {
        this.click();
        if (!shouldPropagateOnKeydown) {
          event.stopPropagation();
        }
      }
    });
  }

  #render(): void {
    render(html`<style>${adornerStyles}</style><slot></slot>`, this.#shadow, {host: this});
  }
}

customElements.define('devtools-adorner', Adorner);

declare global {
  interface HTMLElementTagNameMap {
    'devtools-adorner': Adorner;
  }
}
