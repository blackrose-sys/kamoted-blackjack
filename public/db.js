/* ═══════════════════════════════════════════════════════════════════
   DATABASE & AUTHENTICATION (Supabase Client & Mock Fallback)
   Handles user accounts, persistent profiles, rankings, and stats.
   ═══════════════════════════════════════════════════════════════════ */

// Configuration for Supabase (User can populate these)
const SUPABASE_CONFIG = {
  url: window.ENV_SUPABASE_URL || localStorage.getItem('SB_URL') || '',
  anonKey: window.ENV_SUPABASE_ANON_KEY || localStorage.getItem('SB_KEY') || '',
};

let sbClient = null;

// Initialize Supabase if credentials are present
if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && typeof supabase !== 'undefined') {
  try {
    sbClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log('Supabase Initialized Successfully');
  } catch (e) {
    console.error('Failed to initialize Supabase:', e);
  }
}

// ─── LoL Rank System Helper ───────────────────────────────────────
const RANKS = [
  { name: 'Iron', min: 0, color: '#5b5b5b', badge: '⚙️' },
  { name: 'Bronze', min: 100, color: '#cd7f32', badge: '🥉' },
  { name: 'Silver', min: 300, color: '#c0c0c0', badge: '🥈' },
  { name: 'Gold', min: 600, color: '#ffd700', badge: '🥇' },
  { name: 'Platinum', min: 1000, color: '#e5e4e2', badge: '🛡️' },
  { name: 'Diamond', min: 1500, color: '#b9f2ff', badge: '💎' },
  { name: 'Master', min: 2000, color: '#ff00ff', badge: '🔮' },
  { name: 'Grandmaster', min: 2500, color: '#ff4500', badge: '👑' },
  { name: 'Challenger', min: 3000, color: '#00ffff', badge: '⚡' }
];

function getRankInfo(lp) {
  let activeRank = RANKS[0];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (lp >= RANKS[i].min) {
      activeRank = RANKS[i];
      break;
    }
  }
  return activeRank;
}

// ─── Mock Database (LocalStorage Fallback) ────────────────────────
const MockDB = {
  _getUsers() {
    return JSON.parse(localStorage.getItem('blackjack_users') || '{}');
  },
  _saveUsers(users) {
    localStorage.setItem('blackjack_users', JSON.stringify(users));
  },
  async register(username, password) {
    const users = this._getUsers();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || password.length < 4) {
      throw new Error('Username must be valid and password at least 4 characters');
    }
    if (users[cleanUser]) {
      throw new Error('Username already exists');
    }

    const newUser = {
      username: username.trim(),
      password: password, // For mock only
      bio: 'Ready to beat the dealer!',
      pfp: 'avatar-' + (Math.floor(Math.random() * 5) + 1),
      chips: 10000,
      wins: 0,
      losses: 0,
      draws: 0,
      blackjacks: 0,
      rank_points: 0,
    };

    users[cleanUser] = newUser;
    this._saveUsers(users);
    return newUser;
  },
  async login(username, password) {
    const users = this._getUsers();
    const cleanUser = username.trim().toLowerCase();
    const user = users[cleanUser];
    if (!user || user.password !== password) {
      throw new Error('Invalid username or password');
    }
    return user;
  },
  async updateProfile(username, updates) {
    const users = this._getUsers();
    const cleanUser = username.trim().toLowerCase();
    if (users[cleanUser]) {
      users[cleanUser] = { ...users[cleanUser], ...updates };
      this._saveUsers(users);
      return users[cleanUser];
    }
    throw new Error('User not found');
  },
  async getLeaderboard() {
    const users = this._getUsers();
    return Object.values(users)
      .sort((a, b) => b.chips - a.chips)
      .slice(0, 10);
  },
  async getProfile(username) {
    const users = this._getUsers();
    const user = users[username.trim().toLowerCase()];
    if (!user) throw new Error('Player profile not found');
    return user;
  }
};

// ─── Unified Database Abstraction ─────────────────────────────────
const DB = {
  currentUser: null,

  async register(username, password) {
    if (sbClient) {
      // Supabase Auth + Profile creation
      const { data, error } = await sbClient.auth.signUp({
        email: `${username.toLowerCase()}@kamoted.local`, // Virtual email
        password: password,
        options: {
          data: { username }
        }
      });
      if (error) throw error;
      
      // Load newly created profile
      const profile = await this.getProfile(username);
      this.currentUser = profile;
      this._persistSession(username);
      return profile;
    } else {
      const user = await MockDB.register(username, password);
      this.currentUser = user;
      this._persistSession(user.username);
      return user;
    }
  },

  async login(username, password) {
    if (sbClient) {
      const { data, error } = await sbClient.auth.signInWithPassword({
        email: `${username.toLowerCase()}@kamoted.local`,
        password: password
      });
      if (error) throw error;

      const profile = await this.getProfile(username);
      this.currentUser = profile;
      this._persistSession(username);
      return profile;
    } else {
      const user = await MockDB.login(username, password);
      this.currentUser = user;
      this._persistSession(user.username);
      return user;
    }
  },

  async getProfile(username) {
    if (sbClient) {
      const { data, error } = await sbClient
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();
      if (error) throw error;
      return data;
    } else {
      return await MockDB.getProfile(username);
    }
  },

  async updateProfile(updates) {
    if (!this.currentUser) return;
    const username = this.currentUser.username;
    
    if (sbClient) {
      const { error } = await sbClient
        .from('profiles')
        .update(updates)
        .eq('id', (await sbClient.auth.getUser()).data.user.id);
      if (error) throw error;
      this.currentUser = { ...this.currentUser, ...updates };
      return this.currentUser;
    } else {
      const updated = await MockDB.updateProfile(username, updates);
      this.currentUser = updated;
      return updated;
    }
  },

  async changePassword(newPassword) {
    if (sbClient) {
      const { error } = await sbClient.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } else {
      if (!this.currentUser) return;
      await MockDB.updateProfile(this.currentUser.username, { password: newPassword });
    }
  },

  async getLeaderboard() {
    if (sbClient) {
      const { data, error } = await sbClient
        .from('profiles')
        .select('*')
        .order('chips', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    } else {
      return await MockDB.getLeaderboard();
    }
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('blackjack_session');
    if (sbClient) {
      sbClient.auth.signOut();
    }
  },

  async restoreSession() {
    const username = localStorage.getItem('blackjack_session');
    if (!username) return null;
    try {
      const profile = await this.getProfile(username);
      this.currentUser = profile;
      return profile;
    } catch {
      localStorage.removeItem('blackjack_session');
      return null;
    }
  },

  _persistSession(username) {
    localStorage.setItem('blackjack_session', username);
  },

  // Update game stats in db
  async saveStats(chips, outcome, isBlackjack) {
    if (!this.currentUser) return;
    
    const updates = {
      chips: chips,
    };

    let lpChange = 0;
    if (outcome === 'win') {
      updates.wins = (this.currentUser.wins || 0) + 1;
      lpChange = isBlackjack ? 25 : 15;
    } else if (outcome === 'lose') {
      updates.losses = (this.currentUser.losses || 0) + 1;
      lpChange = -10;
    } else if (outcome === 'push') {
      updates.draws = (this.currentUser.draws || 0) + 1;
    }

    if (isBlackjack) {
      updates.blackjacks = (this.currentUser.blackjacks || 0) + 1;
    }

    // LP updates
    updates.rank_points = Math.max(0, (this.currentUser.rank_points || 0) + lpChange);

    const updated = await this.updateProfile(updates);
    return updated;
  }
};
