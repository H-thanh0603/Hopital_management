// Auth view rendering + handling
const auth = {
  renderLogin() {
    document.getElementById('app').innerHTML = `
      <div class="login-wrapper">
        <div class="login-card">
          <h2><i class="bi bi-hospital text-primary"></i> Hospital MS</h2>
          <p class="subtitle">Sign in to your account</p>
          <div id="loginError" class="alert alert-danger d-none"></div>
          <form id="loginForm">
            <div class="mb-3">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" id="loginEmail" value="admin@hospital.com" required />
            </div>
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input type="password" class="form-control" id="loginPassword" value="Admin@123" required />
            </div>
            <button type="submit" class="btn btn-primary w-100">Sign In</button>
          </form>
          <p class="text-muted text-center mt-3 mb-0" style="font-size:.8rem">
            Demo: admin@hospital.com / Admin@123
          </p>
        </div>
      </div>`;

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const errBox = document.getElementById('loginError');
      errBox.classList.add('d-none');
      try {
        const res = await api.login(email, password);
        api.setAuth(res.data.token, res.data.user);
        app.render();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
      }
    });
  },

  logout() {
    api.clearAuth();
    auth.renderLogin();
  },
};
