// ========================================
// Authentication Module
// ========================================

const AUTH_CONFIG = {
    authUrl: 'https://auth.emergentagent.com/',
    redirectUrl: window.location.origin,
    apiUrl: `${window.location.origin}/api`
};

const authState = {
    user: null,
    isAuthenticated: false,
    isLoading: true
};

// ========================================
// Auth API Functions
// ========================================

async function exchangeSessionId(sessionId) {
    try {
        const response = await fetch(`${AUTH_CONFIG.apiUrl}/auth/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ session_id: sessionId })
        });
        
        if (!response.ok) {
            throw new Error('Failed to exchange session ID');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Session exchange error:', error);
        throw error;
    }
}

async function getCurrentUser() {
    try {
        const response = await fetch(`${AUTH_CONFIG.apiUrl}/auth/me`, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            return null;
        }
        
        if (!response.ok) {
            throw new Error('Failed to get current user');
        }
        
        const user = await response.json();
        return user;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

async function logoutUser() {
    try {
        const response = await fetch(`${AUTH_CONFIG.apiUrl}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Logout failed');
        }
        
        authState.user = null;
        authState.isAuthenticated = false;
        
        // Clear local data
        localStorage.clear();
        
        // Redirect to login
        showLoginScreen();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ========================================
// Auth Flow Functions
// ========================================

function redirectToGoogleAuth() {
    const authUrl = `${AUTH_CONFIG.authUrl}?redirect=${encodeURIComponent(AUTH_CONFIG.redirectUrl)}`;
    window.location.href = authUrl;
}

async function handleAuthCallback() {
    // Check for session_id in URL fragment
    const fragment = window.location.hash.substring(1);
    const params = new URLSearchParams(fragment);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
        console.log('Processing session ID...');
        showLoadingScreen();
        
        try {
            // Exchange session_id for session_token
            const result = await exchangeSessionId(sessionId);
            
            if (result.success && result.user) {
                authState.user = result.user;
                authState.isAuthenticated = true;
                
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Show app
                showApp();
                
                console.log('✅ Authentication successful:', result.user.email);
            } else {
                throw new Error('Invalid session response');
            }
        } catch (error) {
            console.error('Auth callback error:', error);
            showError('Authentication failed. Please try again.');
            setTimeout(() => showLoginScreen(), 2000);
        }
        
        return true;
    }
    
    return false;
}

async function checkExistingAuth() {
    console.log('Checking existing authentication...');
    
    const user = await getCurrentUser();
    
    if (user) {
        authState.user = user;
        authState.isAuthenticated = true;
        authState.isLoading = false;
        showApp();
        console.log('✅ User authenticated:', user.email);
        
        // Trigger app initialization
        if (window.appInitialized) {
            window.appInitialized();
        }
    } else {
        authState.isAuthenticated = false;
        authState.isLoading = false;
        showLoginScreen();
    }
}

// ========================================
// UI Functions
// ========================================

function showLoadingScreen() {
    const appContainer = document.getElementById('app');
    appContainer.innerHTML = `
        <div class="auth-screen loading-screen">
            <div class="auth-card">
                <div class="loading-spinner"></div>
                <h2>Authenticating...</h2>
                <p>Please wait while we log you in.</p>
            </div>
        </div>
    `;
}

function showLoginScreen() {
    const appContainer = document.getElementById('app');
    
    // Remove auth-loading class
    appContainer.classList.remove('auth-loading');
    
    appContainer.innerHTML = `
        <div class="auth-screen" data-testid="login-screen">
            <div class="auth-card">
                <div class="auth-logo">
                    <h1>📝 Notepad + Tools</h1>
                    <p class="auth-tagline">Your personal productivity workspace</p>
                </div>
                
                <div class="auth-features">
                    <div class="feature-item">
                        <span class="feature-icon">📝</span>
                        <span>Create & manage notes</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">🔧</span>
                        <span>Organize your tools</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">🏷️</span>
                        <span>Tag & filter content</span>
                    </div>
                    <div class="feature-item">
                        <span class="feature-icon">☁️</span>
                        <span>Sync across devices</span>
                    </div>
                </div>
                
                <button class="google-login-btn" id="google-login-btn" data-testid="google-login-btn">
                    <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                </button>
                
                <p class="auth-disclaimer">By continuing, you agree to our Terms of Service and Privacy Policy</p>
            </div>
            
            <div id="auth-error" class="auth-error hidden" data-testid="auth-error"></div>
        </div>
    `;
    
    // Add login button handler
    document.getElementById('google-login-btn').addEventListener('click', redirectToGoogleAuth);
}

function showApp() {
    const appContainer = document.getElementById('app');
    
    // Remove auth-loading class to show app
    appContainer.classList.remove('auth-loading');
    
    // App content is already in the HTML, just need to initialize it
    // The app.js init will handle the rest
}

function showError(message) {
    const errorDiv = document.getElementById('auth-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

function updateUserUI() {
    if (!authState.user) return;
    
    // Update header with user info
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.innerHTML = `
            <img src="${authState.user.picture || 'https://via.placeholder.com/40'}" alt="${authState.user.name}" class="user-avatar" />
            <span class="user-name">${authState.user.name}</span>
            <button id="logout-btn" class="btn-secondary" data-testid="logout-btn">Logout</button>
        `;
        
        // Insert before other buttons
        headerActions.insertBefore(userInfo, headerActions.firstChild);
        
        // Add logout handler
        document.getElementById('logout-btn').addEventListener('click', logoutUser);
    }
}

// ========================================
// Initialize Auth
// ========================================

async function initAuth() {
    console.log('🔐 Initializing authentication...');
    
    // First priority: Check for session_id in URL
    const hasSessionId = await handleAuthCallback();
    
    if (!hasSessionId) {
        // Second priority: Check existing authentication
        await checkExistingAuth();
    }
}

// Export functions
window.authModule = {
    initAuth,
    redirectToGoogleAuth,
    logoutUser,
    authState,
    updateUserUI
};