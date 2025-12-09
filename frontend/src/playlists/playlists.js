/* ==================== PLAYLISTS.JS ====================
   Gerenciamento completo: CRUD + Editor de Conteúdo (Widgets e Campanhas)
*/

let currentUser = null;
let searchTimeout = null;
let editingPlaylistId = null;

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = await checkAuth();
    if (!currentUser) return;

    await loadSidebar('playlists');
    setupEventListeners();
    await loadPlaylists();

  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
    showNotification('Erro ao carregar página', 'error');
  }
});

// ==================== LISTAGEM DE PLAYLISTS ====================

async function loadPlaylists(searchTerm = '') {
  const tbody = document.getElementById('playlistsList');

  try {
    let result;
    if (searchTerm.trim()) {
      result = await apiSearch('playlists', searchTerm, ['name'], currentUser.id);
    } else {
      result = await apiSelect('playlists', {
        userId: currentUser.id,
        select: '*',
        order: { field: 'created_at', ascending: false }
      });
    }

    const { data: playlists, error } = result;
    if (error) throw error;

    if (!playlists || playlists.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #718096;">Nenhuma playlist encontrada</td></tr>';
      return;
    }

    renderPlaylistsTable(playlists);

  } catch (error) {
    console.error('❌ Erro ao carregar playlists:', error);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #E53E3E; padding: 20px;">Erro: ${error.message}</td></tr>`;
  }
}

function renderPlaylistsTable(playlists) {
  const tbody = document.getElementById('playlistsList');

  tbody.innerHTML = playlists.map(pl => `
    <tr>
      <td><strong>${escapeHtml(pl.name)}</strong></td>
      <td>${pl.description ? escapeHtml(pl.description) : '<span style="color: #CBD5E0;">-</span>'}</td>
      <td>${formatDuration(pl.duration_total)}</td>
      <td>-</td>
      <td>
        <span style="font-size: 12px; color: ${pl.loop_enabled ? '#10B981' : '#718096'};">
          ${pl.loop_enabled ? '✓ Sim' : '✗ Não'}
        </span>
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn-icon" onclick="openManageContent('${pl.id}', '${escapeHtml(pl.name)}')" title="Gerenciar Conteúdo" style="color: #3182CE; margin-right: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <path d="M3 6h.01M3 12h.01M3 18h.01"></path>
          </svg>
        </button>
        <button class="btn-icon" onclick="openEditModal('${pl.id}')" title="Editar Metadados">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon delete" onclick="deletePlaylist('${pl.id}')" title="Excluir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');
}

// ==================== EDITOR DE CONTEÚDO (MODAL) ====================

async function openManageContent(playlistId, playlistName) {
  editingPlaylistId = playlistId;
  document.getElementById('manageTitle').textContent = `Editar: ${playlistName}`;
  
  document.getElementById('libraryList').innerHTML = '<div class="spinner-small"></div>';
  document.getElementById('playlistItems').innerHTML = '';
  document.getElementById('totalDuration').innerText = '0s';

  document.getElementById('modalManageContent').classList.add('active');

  await Promise.all([
    loadLibraryItems(),
    loadPlaylistItems(playlistId)
  ]);

  setupDragAndDrop();
}

async function loadLibraryItems() {
  const container = document.getElementById('libraryList');
  container.innerHTML = '';

  try {
    // 1. Busca Widgets
    const widgetsPromise = apiSelect('dynamic_contents', {
      userId: currentUser.id,
      eq: { is_active: true }
    });

    // 2. Busca Campanhas Ativas
    const campaignsPromise = apiSelect('campaigns', {
      userId: currentUser.id,
      eq: { status: 'active' }
    });

    const [widgetsResult, campaignsResult] = await Promise.all([widgetsPromise, campaignsPromise]);

    const items = [];

    // Processa Widgets
    if (widgetsResult.data) {
      widgetsResult.data.forEach(w => {
        items.push({
          id: w.id,
          name: w.name,
          type: 'widget',
          displayType: w.content_type || 'Widget',
          defaultDuration: 15
        });
      });
    }

    // Processa Campanhas
    if (campaignsResult.data) {
      campaignsResult.data.forEach(c => {
        items.push({
          id: c.id,
          name: c.name,
          type: 'campaign',
          displayType: 'Campanha',
          defaultDuration: c.duration_seconds || 15
        });
      });
    }

    // Ordena alfabeticamente
    items.sort((a, b) => a.name.localeCompare(b.name));

    // Renderiza
    if (items.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#718096;">Nenhum item disponível</div>';
    } else {
      items.forEach(item => {
        const card = createItemCard(item);
        container.appendChild(card);
      });
    }

  } catch (error) {
    console.error('Erro ao carregar biblioteca:', error);
    container.innerHTML = '<div style="color:red; padding:10px;">Erro ao carregar itens</div>';
  }
}

async function loadPlaylistItems(playlistId) {
  const container = document.getElementById('playlistItems');
  
  // Busca itens fazendo join com widgets E campanhas
  const { data: items, error } = await supabaseClient
    .from('playlist_items')
    .select('*, dynamic_contents(name, content_type), campaigns(name, duration_seconds)')
    .eq('playlist_id', playlistId)
    .order('display_order', { ascending: true });

  if (items && items.length > 0) {
    items.forEach(item => {
      let itemData = null;

      if (item.widget_id && item.dynamic_contents) {
        itemData = {
          id: item.widget_id,
          name: item.dynamic_contents.name,
          type: 'widget',
          displayType: item.dynamic_contents.content_type,
          duration: item.duration // Usa a duração salva no item
        };
      } else if (item.campaign_id && item.campaigns) {
        itemData = {
          id: item.campaign_id,
          name: item.campaigns.name,
          type: 'campaign',
          displayType: 'Campanha',
          duration: item.duration // Usa a duração salva no item
        };
      }

      if (itemData) {
        const card = createItemCard(itemData, item.duration);
        container.appendChild(card);
      }
    });
    updateTotalDuration();
  } else {
    container.innerHTML = `<div class="empty-state">Arraste itens aqui</div>`;
  }
}

function createItemCard(item, currentDuration = null) {
  const el = document.createElement('div');
  el.className = 'widget-card';
  el.dataset.id = item.id;
  el.dataset.type = item.type; // 'widget' ou 'campaign'
  
  const duration = currentDuration || item.defaultDuration || 15;
  
  // Cor diferente para campanha
  const typeStyle = item.type === 'campaign' 
    ? 'background: #FEFCBF; color: #744210;' // Amarelo (Campanha)
    : 'background: #EBF8FF; color: #2B6CB0;'; // Azul (Widget)

  el.innerHTML = `
    <div class="card-top">
      <div>
        <div class="widget-title">${escapeHtml(item.name)}</div>
        <span class="widget-type" style="${typeStyle}">${item.displayType}</span>
      </div>
      <button class="btn-add" title="Adicionar">+</button>
    </div>
    
    <div class="item-settings">
      <div style="display:flex; align-items:center; gap:4px;">
        <label style="font-size:10px;">Tempo:</label>
        <input type="number" class="duration-input" value="${duration}" min="5" onchange="updateTotalDuration()">
        <span style="font-size:10px;">s</span>
      </div>
      <button class="btn-remove" onclick="this.closest('.widget-card').remove(); updateTotalDuration()">
        🗑️
      </button>
    </div>
  `;

  el.querySelector('.btn-add').addEventListener('click', () => {
    const clone = el.cloneNode(true);
    const targetList = document.getElementById('playlistItems');
    const empty = targetList.querySelector('.empty-state');
    if(empty) empty.remove();

    targetList.appendChild(clone);
    reattachCardEvents(clone);
    updateTotalDuration();
  });

  return el;
}

function reattachCardEvents(card) {
  card.querySelector('.btn-remove').onclick = function() {
    card.remove();
    updateTotalDuration();
  };
  card.querySelector('.duration-input').onchange = updateTotalDuration;
}

function setupDragAndDrop() {
  const libraryList = document.getElementById('libraryList');
  const playlistItems = document.getElementById('playlistItems');

  new Sortable(libraryList, {
    group: { name: 'shared', pull: 'clone', put: false },
    sort: false,
    animation: 150
  });

  new Sortable(playlistItems, {
    group: 'shared',
    animation: 150,
    onAdd: function (evt) {
      const empty = playlistItems.querySelector('.empty-state');
      if (empty) empty.remove();
      updateTotalDuration();
    },
    onSort: function () {
      updateTotalDuration();
    }
  });
}

function updateTotalDuration() {
  window.updateTotalDuration = function() {
    const inputs = document.querySelectorAll('#playlistItems .duration-input');
    let total = 0;
    inputs.forEach(input => {
      total += parseInt(input.value) || 0;
    });
    
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const text = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    document.getElementById('totalDuration').innerText = text;
  };
  window.updateTotalDuration();
}

async function saveContent() {
  const btn = document.getElementById('btnSaveContent');
  const originalText = btn.innerText;
  btn.innerText = 'Salvando...';
  btn.disabled = true;

  try {
    const itemElements = document.querySelectorAll('#playlistItems .widget-card');
    const itemsToSave = [];
    let totalDuration = 0;

    itemElements.forEach((el, index) => {
      const id = el.dataset.id;
      const type = el.dataset.type; // 'widget' ou 'campaign'
      const duration = parseInt(el.querySelector('.duration-input').value) || 15;
      totalDuration += duration;

      itemsToSave.push({
        playlist_id: editingPlaylistId,
        widget_id: type === 'widget' ? id : null,
        campaign_id: type === 'campaign' ? id : null,
        display_order: index + 1,
        duration: duration
      });
    });

    // 1. Remove itens antigos
    const { error: deleteError } = await supabaseClient
      .from('playlist_items')
      .delete()
      .eq('playlist_id', editingPlaylistId);
    
    if (deleteError) throw deleteError;

    // 2. Insere novos
    if (itemsToSave.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('playlist_items')
        .insert(itemsToSave);
      if (insertError) throw insertError;
    }

    // 3. Atualiza duração total
    await supabaseClient
      .from('playlists')
      .update({ duration_total: totalDuration })
      .eq('id', editingPlaylistId);

    showNotification('Conteúdo salvo com sucesso!', 'success');
    document.getElementById('modalManageContent').classList.remove('active');
    loadPlaylists();

  } catch (error) {
    console.error('Erro ao salvar:', error);
    showNotification('Erro ao salvar: ' + error.message, 'error');
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

// ==================== CRUD BÁSICO ====================

async function handleCreatePlaylist(e) {
  e.preventDefault();
  const name = document.getElementById('playlistName').value;
  const description = document.getElementById('playlistDescription').value;
  const loop_enabled = document.getElementById('playlistLoop').checked;

  setLoading('#formNewPlaylist button[type="submit"]', true);

  try {
    const { error } = await apiInsert('playlists', {
      name, description, loop_enabled, duration_total: 0
    }, currentUser.id);

    if (error) throw error;

    document.getElementById('modalNewPlaylist').classList.remove('active');
    document.getElementById('formNewPlaylist').reset();
    loadPlaylists();
    showNotification('Playlist criada!', 'success');
  } catch (error) {
    showNotification('Erro ao criar', 'error');
  } finally {
    setLoading('#formNewPlaylist button[type="submit"]', false, 'Salvar Playlist');
  }
}

async function openEditModal(playlistId) {
  try {
    const { data: playlists, error } = await apiSelect('playlists', { eq: { id: playlistId } });
    if (error || !playlists || playlists.length === 0) throw new Error('Não encontrada');
    const pl = playlists[0];
    document.getElementById('editPlaylistId').value = pl.id;
    document.getElementById('editPlaylistName').value = pl.name;
    document.getElementById('editPlaylistDescription').value = pl.description || '';
    document.getElementById('editPlaylistLoop').checked = pl.loop_enabled || false;
    document.getElementById('modalEditPlaylist').classList.add('active');
  } catch (error) {
    showNotification('Erro ao carregar', 'error');
  }
}

async function handleEditPlaylist(e) {
  e.preventDefault();
  const id = document.getElementById('editPlaylistId').value;
  const name = document.getElementById('editPlaylistName').value;
  const description = document.getElementById('editPlaylistDescription').value;
  const loop_enabled = document.getElementById('editPlaylistLoop').checked;

  setLoading('#formEditPlaylist button[type="submit"]', true);

  try {
    const { error } = await apiUpdate('playlists', id, { name, description, loop_enabled });
    if (error) throw error;
    document.getElementById('modalEditPlaylist').classList.remove('active');
    loadPlaylists();
    showNotification('Atualizado!', 'success');
  } catch (error) {
    showNotification('Erro ao atualizar', 'error');
  } finally {
    setLoading('#formEditPlaylist button[type="submit"]', false, 'Salvar Alterações');
  }
}

async function deletePlaylist(id) {
  if (!confirm('Excluir esta playlist?')) return;
  try {
    const { error } = await apiDelete('playlists', id);
    if (error) throw error;
    loadPlaylists();
    showNotification('Excluído!', 'success');
  } catch (error) {
    showNotification('Erro ao excluir', 'error');
  }
}

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function setupEventListeners() {
  setupModalHandlers('modalNewPlaylist', 'btnOpenModal', 'btnCloseModal', 'btnCancelModal');
  setupModalHandlers('modalEditPlaylist', null, 'btnCloseEditModal', 'btnCancelEditModal');
  setupModalHandlers('modalManageContent', null, 'btnCloseManageModal', 'btnCancelManage');

  document.getElementById('formNewPlaylist').addEventListener('submit', handleCreatePlaylist);
  document.getElementById('formEditPlaylist').addEventListener('submit', handleEditPlaylist);
  document.getElementById('btnSaveContent').addEventListener('click', saveContent);

  document.getElementById('searchWidget').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('#libraryList .widget-card');
    cards.forEach(card => {
      const title = card.querySelector('.widget-title').innerText.toLowerCase();
      card.style.display = title.includes(term) ? 'flex' : 'none';
    });
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { loadPlaylists(e.target.value) }, 500);
  });
}