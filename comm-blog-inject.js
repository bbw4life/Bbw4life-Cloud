/* ================================================================
   BBW4LIFE — HOME "FROM THE JOURNAL" — injecte 4 cartes blog
   Réutilise window.bbwFetchBlogArticles() (exposé par /blog/blog.js)
   pour aller chercher les données dans /blog/blog-articles.json —
   aucune donnée dupliquée en dur ici, même source que la page blog.
================================================================ */
(function () {
  'use strict';

  // IDs des 4 articles les plus consultés (choisis par nombre de vues)
  var FEATURED_IDS = ['card-8', 'card-6', 'card-12', 'card-10'];

  function shareButtonsHTML() {
    return `
      <div class="card-share-row">
        <span class="card-share-label">Share:</span>
        <a href="#" class="share-btn card-share-btn" aria-label="Share on Facebook"><i class="fab fa-facebook-f"></i></a>
        <a href="#" class="share-btn card-share-btn" aria-label="Share on X / Twitter"><i class="fab fa-x-twitter"></i></a>
        <a href="#" class="share-btn card-share-btn" aria-label="Share on Pinterest"><i class="fab fa-pinterest-p"></i></a>
        <a href="#" class="share-btn card-share-btn" aria-label="Share on LinkedIn"><i class="fab fa-linkedin-in"></i></a>
        <a href="#" class="share-btn card-share-btn" aria-label="Share on WhatsApp"><i class="fab fa-whatsapp"></i></a>
      </div>`;
  }

  function renderCard(card) {
    return `
      <article class="blog-card" data-category="${card.category}" id="${card.id}">
        <div class="blog-card-img-wrap">
          <a href="${card.url}" class="card-img-link"><img src="${card.image}" alt="${card.imageAlt}" loading="lazy"></a>
          <span class="card-category-badge">${card.badge}</span>
          ${card.isNew ? '<span class="card-new-badge">New</span>' : ''}
          <button class="card-bookmark" aria-label="Bookmark article" title="Save article"><i class="fi fi-rr-bookmark"></i></button>
          <div class="card-read-time"><i class="fi fi-rr-clock"></i> ${card.readTime}</div>
        </div>
        <div class="blog-card-body">
          <h3>${card.title}</h3>
          <p>${card.excerpt}</p>
          <div class="blog-card-meta">
            <div class="card-author">
              <img src="${card.author.image}" alt="${card.author.name}" class="card-author-img">
              <span>${card.author.name}</span>
            </div>
            <div class="card-stats">
              <span><i class="fi fi-rr-eye"></i> ${card.views}</span>
              <span class="card-date">${card.date}</span>
            </div>
          </div>
          <a href="${card.url}" class="card-read-more">Read Article <span>→</span></a>
          ${shareButtonsHTML()}
        </div>
      </article>`;
  }

  function init() {
    var scroller = document.getElementById('comm-blog-scroller');
    if (!scroller) return;
    if (typeof window.bbwFetchBlogArticles !== 'function') return;

    window.bbwFetchBlogArticles().then(function (data) {
      if (!data || !data.cards) return;
      var chosen = FEATURED_IDS
        .map(function (id) { return data.cards.find(function (c) { return c.id === id; }); })
        .filter(Boolean);
      scroller.innerHTML = chosen.map(renderCard).join('');
    }).catch(function () {
      /* fetch échoué — la section reste vide plutôt que de casser la page */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
