/* ==================== UTILS.JS ====================
   Funções compartilhadas entre todas as páginas
   Dependências: config.js (Supabase)
*/

// ==================== 1. CARREGAMENTO DA SIDEBAR ====================

async function loadSidebar(activePage) {
  try {
    const container = document.getElementById('sidebar-container')
    
    if (!container) {
      console.error('❌ Elemento #sidebar-container não encontrado no HTML')
      return
    }

    console.log('🔄 Carregando sidebar para página:', activePage)

    // Determina o caminho correto da sidebar baseado na localização atual
    const sidebarPath = '/frontend/src/shared/sidebar.html'
    
    const response = await fetch(sidebarPath)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Arquivo não encontrado em ${sidebarPath}`)
    }

    const html = await response.text()
    container.innerHTML = html

    // Marca o link ativo (verde)
    if (activePage) {
      const activeLink = container.querySelector(`.nav-item[data-page="${activePage}"]`)
      if (activeLink) {
        activeLink.classList.add('active')
        console.log('✅ Link ativo marcado:', activePage)
      }
    }

    // Configura botão de logout
    const btnLogout = document.getElementById('btnLogout')
    if (btnLogout) {
      btnLogout.addEventListener('click', handleLogout)
    }
    
    // Atualiza dados do usuário na sidebar
    updateSidebarUserInfo()

    console.log('✅ Sidebar carregada com sucesso')

  } catch (error) {
    console.error('❌ Erro ao carregar sidebar:', error)
    const container = document.getElementById('sidebar-container')
    if (container) {
      container.innerHTML = `
        <div style="padding: 20px; color: red; background: #fee; border-radius: 8px; margin: 10px;">
          <strong>Erro ao carregar menu:</strong> ${error.message}
          <br><small>Verifique o console (F12) para mais detalhes</small>
        </div>`
    }
  }
}

// ==================== 2. AUTENTICAÇÃO ====================

async function checkAuth() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser()
    
    if (!user) {
      console.warn('⚠️ Usuário não autenticado. Redirecionando para login...')
      window.location.href = '/frontend/src/auth/login.html'
      return null
    }

    console.log('✅ Usuário autenticado:', user.email)
    return user

  } catch (error) {
    console.error('❌ Erro ao verificar autenticação:', error)
    window.location.href = '/frontend/src/auth/login.html'
    return null
  }
}

// ==================== 3. DADOS DO USUÁRIO NA SIDEBAR ====================

async function updateSidebarUserInfo() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser()
    
    if (!user) return

    const nameEl = document.getElementById('userName')
    const emailEl = document.getElementById('userEmail')
    const avatarEl = document.getElementById('avatar')

    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'
    
    if (nameEl) nameEl.textContent = userName
    if (emailEl) emailEl.textContent = user.email
    if (avatarEl) avatarEl.textContent = userName.charAt(0).toUpperCase()

    console.log('✅ Informações do usuário atualizadas')

  } catch (error) {
    console.error('❌ Erro ao atualizar informações:', error)
  }
}

// ==================== 4. LOGOUT ====================

async function handleLogout() {
  try {
    console.log('🚪 Realizando logout...')
    await supabaseClient.auth.signOut()
    window.location.href = '/frontend/src/auth/login.html'
  } catch (error) {
    console.error('❌ Erro ao fazer logout:', error)
    alert('Erro ao sair. Tente novamente.')
  }
}

// ==================== 5. NOTIFICAÇÕES ====================

function showNotification(message, type = 'info', duration = 3000) {
  // Cria container se não existir
  let container = document.getElementById('notifications-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'notifications-container'
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 400px;
    `
    document.body.appendChild(container)
  }

  // Cria notificação
  const notification = document.createElement('div')
  
  const bgColor = {
    'success': '#DEF7EC',
    'error': '#FEE2E2',
    'warning': '#FEF3C7',
    'info': '#EFF6FF'
  }[type] || '#F3F4F6'

  const borderColor = {
    'success': '#10B981',
    'error': '#EF4444',
    'warning': '#F59E0B',
    'info': '#3B82F6'
  }[type] || '#9CA3AF'

  const textColor = {
    'success': '#03543F',
    'error': '#7F1D1D',
    'warning': '#92400E',
    'info': '#0C2340'
  }[type] || '#374151'

  notification.style.cssText = `
    background: ${bgColor};
    border-left: 4px solid ${borderColor};
    color: ${textColor};
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `
  notification.textContent = message
  container.appendChild(notification)

  // Remove após duração
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out'
    setTimeout(() => notification.remove(), 300)
  }, duration)
}

// Adiciona keyframes de animação
if (!document.getElementById('notification-styles')) {
  const style = document.createElement('style')
  style.id = 'notification-styles'
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `
  document.head.appendChild(style)
}

// ==================== 6. UTILITÁRIOS ====================

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

console.log('✅ Utils carregado com sucesso')