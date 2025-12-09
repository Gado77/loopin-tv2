// Verifica se o usuário está logado antes de carregar a página
(async function() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = CONFIG.ROUTES.LOGIN;
    }
})();