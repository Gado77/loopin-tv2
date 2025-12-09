let currentUser = null

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = await checkAuth()
    if (!currentUser) return

    await loadSidebar('reports')
    setupEventListeners()
    await loadReports()

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao carregar página', 'error')
  }
})

async function loadReports() {
  try {
    const { data: views, error } = await apiSelect('analytics_views', {
      userId: currentUser.id,
      select: '*'
    })

    if (error) throw error

    const totalViews = views?.length || 0
    const totalSeconds = views?.reduce((sum, v) => sum + (v.duration_seconds || 0), 0) || 0
    const totalHours = (totalSeconds / 3600).toFixed(1)

    document.getElementById('totalViews').innerText = totalViews
    document.getElementById('totalHours').innerText = totalHours + 'h'

    const { data: campaigns } = await apiSelect('campaigns', {
      userId: currentUser.id,
      select: 'id'
    })

    const { data: screens } = await apiSelect('screens', {
      userId: currentUser.id,
      select: 'id'
    })

    document.getElementById('totalCampaigns').innerText = campaigns?.length || 0
    document.getElementById('totalScreens').innerText = screens?.length || 0

    // Top Campanhas (mock)
    document.getElementById('topCampaigns').innerHTML = '<tr><td colspan="3" style="text-align: center; color: #718096;">Sem dados disponíveis</td></tr>'

    // Top Telas (mock)
    document.getElementById('topScreens').innerHTML = '<tr><td colspan="3" style="text-align: center; color: #718096;">Sem dados disponíveis</td></tr>'

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao carregar relatórios', 'error')
  }
}

function setupEventListeners() {
  document.getElementById('btnExportCSV').addEventListener('click', exportCSV)
  document.getElementById('btnFilter').addEventListener('click', loadReports)
}

function exportCSV() {
  showNotification('Exportação em desenvolvimento', 'info')
}

console.log('✅ Reports.js carregado')