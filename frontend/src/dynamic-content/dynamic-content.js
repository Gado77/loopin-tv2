/* Arquivo: dynamic-content.js
  Responsável pela lógica de criação, listagem e exclusão de widgets dinâmicos.
*/

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Verificação de Auth
    const user = await checkAuth();
    if (!user) return;

    // 2. Carregar Sidebar
    await loadSidebar('dynamic-content'); // Certifique-se que o link na sidebar tenha data-page="dynamic-content"

    // 3. Inicializar a Página
    console.log('🚀 Gerenciador de Conteúdo Dinâmico iniciado');
    loadWidgets(user.id);
    setupEventListeners(user.id);

  } catch (error) {
    console.error('Erro fatal na inicialização:', error);
  }
});

// --- FUNÇÕES PRINCIPAIS ---

/**
 * Carrega a lista de widgets do Supabase
 */
async function loadWidgets(userId) {
  const listBody = document.getElementById('widgetsList');
  
  try {
    const { data: widgets, error } = await supabaseClient
      .from('dynamic_contents') // Nome da tabela no banco
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!widgets || widgets.length === 0) {
      listBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 32px; color: #718096;">
            Nenhum widget criado ainda. Clique em "Novo Widget" para começar.
          </td>
        </tr>
      `;
      return;
    }

    // Renderiza a tabela
    listBody.innerHTML = widgets.map(widget => {
      const date = new Date(widget.created_at).toLocaleDateString('pt-BR');
      const typeLabel = getWidgetTypeLabel(widget.content_type);
      
      return `
        <tr>
          <td>
            <div style="font-weight: 500; color: var(--color-dark)">${escapeHtml(widget.name)}</div>
          </td>
          <td>
            <span class="status-badge" style="background: #EBF8FF; color: #2B6CB0;">
              ${typeLabel}
            </span>
          </td>
          <td>
            <span class="status-badge ${widget.is_active ? 'active' : 'inactive'}">
              ${widget.is_active ? 'Ativo' : 'Inativo'}
            </span>
          </td>
          <td>${date}</td>
          <td style="text-align: right;">
            <button class="btn-icon delete" onclick="deleteWidget('${widget.id}')" title="Excluir">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Erro ao carregar widgets:', error);
    listBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Erro ao carregar dados.</td></tr>`;
  }
}

/**
 * Salva um novo widget no Supabase
 */
async function createWidget(userId) {
  const btnSubmit = document.querySelector('#formNewWidget button[type="submit"]');
  const originalText = btnSubmit.innerText;
  
  try {
    btnSubmit.innerText = 'Salvando...';
    btnSubmit.disabled = true;

    // Coleta dados básicos
    const name = document.getElementById('widgetName').value;
    const type = document.getElementById('widgetType').value;
    const isActive = document.getElementById('widgetActive').checked;

    // Coleta configurações específicas baseadas no tipo
    let config = {};

    if (type === 'weather') {
      config = {
        city: document.getElementById('weatherCity').value,
        interval: parseInt(document.getElementById('weatherInterval').value) || 30
      };
    } else if (type === 'news') {
      config = {
        category: document.getElementById('newsCategory').value,
        interval: parseInt(document.getElementById('newsInterval').value) || 60
      };
    } else if (type === 'ticker') {
      config = {
        text: document.getElementById('tickerText').value,
        speed: parseInt(document.getElementById('tickerSpeed').value) || 50
      };
    } else if (type === 'html') {
      config = {
        html: document.getElementById('htmlContent').value
      };
    }

    // Validação simples
    if (!name || !type) {
      alert('Por favor, preencha o nome e o tipo do widget.');
      return;
    }

    // Insert no Banco
    const { error } = await supabaseClient
      .from('dynamic_contents')
      .insert([{
        user_id: userId,
        name: name,
        content_type: type, // Atenção: no banco deve ser content_type ou type
        configuration: config, // Coluna JSONB no banco
        is_active: isActive
      }]);

    if (error) throw error;

    // Sucesso
    closeModal();
    document.getElementById('formNewWidget').reset();
    await loadWidgets(userId); // Recarrega a tabela
    alert('Widget criado com sucesso!');

  } catch (error) {
    console.error('Erro ao criar widget:', error);
    alert('Erro ao salvar widget: ' + error.message);
  } finally {
    btnSubmit.innerText = originalText;
    btnSubmit.disabled = false;
  }
}

/**
 * Exclui um widget
 * (Função global para ser acessível pelo onclick do HTML)
 */
window.deleteWidget = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este widget?')) return;

  try {
    const { error } = await supabaseClient
      .from('dynamic_contents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Recarrega a lista
    const { data: { user } } = await supabaseClient.auth.getUser();
    if(user) loadWidgets(user.id);

  } catch (error) {
    console.error('Erro ao excluir:', error);
    alert('Não foi possível excluir o widget.');
  }
};

// --- CONFIGURAÇÃO DE EVENTOS E UI ---

function setupEventListeners(userId) {
  // 1. Modal: Abrir e Fechar
  const modal = document.getElementById('modalNewWidget');
  const btnOpen = document.getElementById('btnOpenModal');
  const btnClose = document.getElementById('btnCloseModal');
  const btnCancel = document.getElementById('btnCancelModal');

  function openModal() { modal.classList.add('active'); }
  
  // Função global de fechar modal para usar no createWidget
  window.closeModal = function() { modal.classList.remove('active'); };

  if(btnOpen) btnOpen.addEventListener('click', openModal);
  if(btnClose) btnClose.addEventListener('click', closeModal);
  if(btnCancel) btnCancel.addEventListener('click', closeModal);

  // Fechar ao clicar fora
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // 2. Alternar campos do formulário baseado no tipo
  const typeSelect = document.getElementById('widgetType');
  typeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    
    // Esconde todos
    document.querySelectorAll('.widget-config').forEach(el => el.classList.add('hidden'));

    // Mostra o específico
    if (type === 'weather') document.getElementById('weatherConfig').classList.remove('hidden');
    if (type === 'news') document.getElementById('newsConfig').classList.remove('hidden');
    if (type === 'ticker') document.getElementById('tickerConfig').classList.remove('hidden');
    if (type === 'html') document.getElementById('htmlConfig').classList.remove('hidden');
  });

  // 3. Submit do Formulário
  const form = document.getElementById('formNewWidget');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    createWidget(userId);
  });

  // 4. Busca (Filtro local)
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#widgetsList tr');
    
    rows.forEach(row => {
      // Pega o texto da primeira célula (Nome)
      const text = row.querySelector('td')?.innerText.toLowerCase() || '';
      if (text.includes(term)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  });
}

// --- HELPERS ---

function getWidgetTypeLabel(type) {
  const map = {
    'weather': '🌤️ Clima',
    'news': '📰 Notícias',
    'ticker': '📝 Ticker (Letreiro)',
    'html': '💻 HTML Custom'
  };
  return map[type] || type;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}