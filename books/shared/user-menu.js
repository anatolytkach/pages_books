/**
 * Shared user-menu web component.
 *
 * Renders a small auth indicator in the top-right of any page.
 * - Signed out: shows "Sign in" link
 * - Signed in: shows avatar/initials + dropdown with My Books, My Account, Sign Out
 *
 * Usage: add <user-menu></user-menu> in your HTML and load this script as a module.
 * Requires the Supabase JS library to be loaded globally.
 */

import config from './config.js';

const STYLES = `
  :host {
    display: inline-flex;
    align-items: center;
    position: relative;
    font-family: "Source Sans 3", "Helvetica Neue", sans-serif;
    font-size: 14px;
    z-index: 50;
  }

  .signin-link {
    color: #028f80;
    font-weight: 600;
    text-decoration: none;
    padding: 6px 14px;
    border: 1px solid #d8dee8;
    border-radius: 10px;
    background: linear-gradient(90deg, #fcfaf8, #ffffff);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .signin-link:hover {
    border-color: #028f80;
  }

  .avatar-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid #d8dee8;
    background: #028f80;
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0;
    transition: border-color 0.15s;
  }

  .avatar-btn:hover,
  .avatar-btn.open {
    border-color: #028f80;
  }

  .avatar-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 180px;
    background: #fff;
    border: 1px solid #d8dee8;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    overflow: hidden;
  }

  .dropdown.open {
    display: block;
  }

  .dropdown-header {
    padding: 12px 14px 8px;
    font-weight: 600;
    color: #1f1b16;
    border-bottom: 1px solid #d8dee8;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-header small {
    display: block;
    font-weight: 400;
    color: #6c645a;
    font-size: 12px;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown a,
  .dropdown button {
    display: block;
    width: 100%;
    padding: 10px 14px;
    text-align: left;
    text-decoration: none;
    color: #1f1b16;
    font-family: inherit;
    font-size: 14px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.1s;
  }

  .dropdown a:hover,
  .dropdown button:hover {
    background: #f5f3f0;
  }

  .dropdown .signout-btn {
    color: #c0392b;
    border-top: 1px solid #d8dee8;
  }
`;

class UserMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sb = null;
    this._session = null;
    this._profile = null;
  }

  connectedCallback() {
    this.render();
    this._init();
  }

  async _init() {
    if (!window.supabase) {
      // Supabase not loaded — show sign-in link as fallback
      this.render();
      return;
    }

    this._sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    const { data: { session } } = await this._sb.auth.getSession();
    this._session = session;

    if (session) {
      await this._loadProfile();
    }

    this.render();

    // Listen for auth changes
    this._sb.auth.onAuthStateChange(async (_event, session) => {
      this._session = session;
      if (session) {
        await this._loadProfile();
      } else {
        this._profile = null;
      }
      this.render();
    });
  }

  async _loadProfile() {
    if (!this._session) return;
    const { data } = await this._sb
      .from('user_profiles')
      .select('display_name, avatar_url')
      .eq('id', this._session.user.id)
      .single();
    this._profile = data;
  }

  _getInitials() {
    const name = this._profile?.display_name
      || this._session?.user?.user_metadata?.display_name
      || this._session?.user?.email
      || '?';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  _getDisplayName() {
    return this._profile?.display_name
      || this._session?.user?.user_metadata?.display_name
      || this._session?.user?.email?.split('@')[0]
      || 'User';
  }

  render() {
    const signedIn = !!this._session;
    const returnTo = encodeURIComponent(window.location.pathname + window.location.hash);

    let html;
    if (!signedIn) {
      html = `<a class="signin-link" href="/books/auth/?returnTo=${returnTo}">Sign in</a>`;
    } else {
      const avatar = this._profile?.avatar_url || this._session?.user?.user_metadata?.avatar_url;
      const initials = this._getInitials();
      const name = this._getDisplayName();
      const email = this._session.user.email || '';

      const avatarContent = avatar
        ? `<img src="${avatar}" alt="" />`
        : initials;

      html = `
        <button class="avatar-btn" id="avatar">${avatarContent}</button>
        <div class="dropdown" id="dropdown">
          <div class="dropdown-header">
            ${name}
            <small>${email}</small>
          </div>
          <a href="/books/account/">My Account</a>
          <a href="/books/account/#library">My Library</a>
          <a href="/books/account/#publications">My Publications</a>
          <a href="/books/publish/">Publish</a>
          <button class="signout-btn" id="signout">Sign Out</button>
        </div>
      `;
    }

    this.shadowRoot.innerHTML = `<style>${STYLES}</style>${html}`;

    // Bind events after render
    if (signedIn) {
      const avatarBtn = this.shadowRoot.getElementById('avatar');
      const dropdown = this.shadowRoot.getElementById('dropdown');
      const signoutBtn = this.shadowRoot.getElementById('signout');

      avatarBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        avatarBtn.classList.toggle('open', isOpen);
      });

      signoutBtn?.addEventListener('click', async () => {
        await this._sb.auth.signOut();
        window.location.href = '/books/';
      });

      // Close dropdown on outside click
      document.addEventListener('click', () => {
        dropdown?.classList.remove('open');
        avatarBtn?.classList.remove('open');
      });
    }
  }
}

customElements.define('user-menu', UserMenu);
