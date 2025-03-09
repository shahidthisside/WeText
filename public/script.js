// Global state
let currentUser = null;
let token = localStorage.getItem('token') || null;
let profiles = [];
let matches = [];
let friends = [];
let posts = [];
let thoughts = [];
let chatHistories = {};
let isTyping = false;
let replyingToMessage = null;

// Check if user is already logged in
if (token) {
  try {
    fetch('http://localhost:5001/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        currentUser = data.find(u => u.id === JSON.parse(atob(token.split('.')[1])).id);
        if (currentUser) {
          document.getElementById('auth-text').textContent = 'Logout';
        } else {
          localStorage.removeItem('token');
          token = null;
        }
      });
  } catch (error) {
    console.error('Error verifying token:', error);
    localStorage.removeItem('token');
    token = null;
  }
}

// Fetch initial data from backend
async function fetchInitialData() {
  try {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const [usersRes, postsRes] = await Promise.all([
      fetch('http://localhost:5001/api/users', { headers }),
      fetch('http://localhost:5001/api/posts', { headers })
    ]);
    profiles = await usersRes.json();
    posts = await postsRes.json();
    thoughts = posts.filter(p => p.type === 'thought');
    renderCards();
    renderMatches();
    renderFriends();
    renderFeeds();
  } catch (error) {
    console.error('Error fetching initial data:', error);
  }
}

// Render functions
function renderCards(searchQuery = '', filter = 'all', sort = 'none') {
  const matchFeed = document.querySelector('.match-feed');
  matchFeed.innerHTML = `
    <h2>Find Your Weird</h2>
    <div class="search-bar">
      <input type="text" id="username-search" placeholder="Search by username..." />
      <button id="search-btn"><i class="fas fa-search"></i></button>
    </div>
    <div class="filters">
      <select id="match-filter">
        <option value="all">All</option>
        <option value="tags">By Tags</option>
        <option value="likes">By Likes</option>
        <option value="match">By Match %</option>
      </select>
      <select id="match-sort">
        <option value="none">Sort By</option>
        <option value="match-desc">Match % (High to Low)</option>
        <option value="match-asc">Match % (Low to High)</option>
        <option value="username">Username (A-Z)</option>
      </select>
    </div>
  `;

  let filteredProfiles = [...profiles];
  if (searchQuery) {
    filteredProfiles = filteredProfiles.filter(profile => profile.username.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (filter === 'tags') {
    filteredProfiles = filteredProfiles.filter(profile => profile.tags);
  } else if (filter === 'likes') {
    filteredProfiles = filteredProfiles.filter(profile => profile.likes > 0);
  } else if (filter === 'match') {
    filteredProfiles = filteredProfiles.filter(profile => profile.match >= 80);
  }

  if (sort === 'match-desc') {
    filteredProfiles.sort((a, b) => b.match - a.match);
  } else if (sort === 'match-asc') {
    filteredProfiles.sort((a, b) => a.match - b.match);
  } else if (sort === 'username') {
    filteredProfiles.sort((a, b) => a.username.localeCompare(b.username));
  }

  if (filteredProfiles.length === 0) {
    matchFeed.innerHTML += '<p>No results found.</p>';
    return;
  }

  filteredProfiles.forEach((profile, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-index', index);
    card.innerHTML = `
      <p><strong>Username:</strong> ${profile.username}</p>
      <p><strong>Thought:</strong> ${profile.thought}</p>
      <p><strong>Tags:</strong> ${profile.tags}</p>
      <p><strong>Match:</strong> ${profile.match}%</p>
      <p>Likes: <span class="like-count">${profile.likes}</span> | Comments: <span class="comment-count">${profile.comments}</span></p>
      <button class="like-btn">Like</button>
      <button class="view-profile-btn">View Profile</button>
      <div class="buttons">
        <button class="no-btn">No</button>
        <button class="yes-btn">Yes</button>
      </div>
    `;
    matchFeed.appendChild(card);
  });

  document.querySelectorAll('.yes-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      if (!currentUser) {
        alert('Please log in to add matches!');
        return;
      }
      const card = this.closest('.card');
      const index = card.getAttribute('data-index');
      const match = filteredProfiles[index];
      const response = await fetch('http://localhost:5001/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: currentUser.id, matchId: match.id })
      });
      if (response.ok) {
        matches.push(match);
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 300);
        alert('Match! Added to your matches.');
        renderMatches();
        renderFeeds();
      }
    });
  });
  document.querySelectorAll('.no-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.card');
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
      alert('Nope!');
    });
  });
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      if (!currentUser) {
        alert('Please log in to like profiles!');
        return;
      }
      const card = this.closest('.card');
      const index = card.getAttribute('data-index');
      filteredProfiles[index].likes++;
      card.querySelector('.like-count').textContent = filteredProfiles[index].likes;
      await fetch(`http://localhost:5001/api/users/${filteredProfiles[index].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ likes: filteredProfiles[index].likes })
      });
      renderFeeds();
    });
  });
  document.querySelectorAll('.view-profile-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.card');
      const index = card.getAttribute('data-index');
      showProfile(filteredProfiles[index]);
    });
  });

  document.getElementById('match-filter').value = filter;
  document.getElementById('match-sort').value = sort;
  document.getElementById('match-filter').addEventListener('change', (e) => {
    renderCards(searchQuery, e.target.value, document.getElementById('match-sort').value);
  });
  document.getElementById('match-sort').addEventListener('change', (e) => {
    renderCards(searchQuery, document.getElementById('match-filter').value, e.target.value);
  });

  document.getElementById('search-btn').addEventListener('click', () => {
    const searchQuery = document.getElementById('username-search').value;
    renderCards(searchQuery, filter, sort);
  });
  document.getElementById('username-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const searchQuery = document.getElementById('username-search').value;
      renderCards(searchQuery, filter, sort);
    }
  });
}

function renderMatches() {
  const matchesSection = document.querySelector('.matches');
  matchesSection.innerHTML = '<h2>Your Matches</h2>';

  if (matches.length === 0) {
    matchesSection.innerHTML += '<p>No matches yet!</p>';
  } else {
    matches.forEach((match, index) => {
      const matchDiv = document.createElement('div');
      matchDiv.className = 'match';
      matchDiv.setAttribute('data-index', index);
      matchDiv.innerHTML = `
        <p><strong>Username:</strong> ${match.username}</p>
        <p><strong>Thought:</strong> ${match.thought}</p>
        <p><strong>Tags:</strong> ${match.tags}</p>
        <p><strong>Match:</strong> ${match.match}%</p>
        <p>Likes: <span class="like-count">${match.likes}</span> | Comments: <span class="comment-count">${match.comments}</span></p>
        <button class="like-btn">Like</button>
        <button class="view-profile-btn">View Profile</button>
        <button class="remove-btn">Remove</button>
        <button class="reply-btn">Reply</button>
        <button class="friend-btn">Add Friend</button>
      `;
      matchDiv.addEventListener('click', () => showProfile(match));
      matchesSection.appendChild(matchDiv);
    });

    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!currentUser) {
          alert('Please log in to remove matches!');
          return;
        }
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        await fetch(`http://localhost:5001/api/matches/${matches[index].id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        matches.splice(index, 1);
        renderMatches();
        renderFeeds();
      });
    });
    document.querySelectorAll('.reply-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        showChat(matches[index]);
      });
    });
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!currentUser) {
          alert('Please log in to like matches!');
          return;
        }
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        matches[index].likes++;
        matchDiv.querySelector('.like-count').textContent = matches[index].likes;
        await fetch(`http://localhost:5001/api/users/${matches[index].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ likes: matches[index].likes })
        });
        renderFeeds();
      });
    });
    document.querySelectorAll('.friend-btn').forEach(btn => {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!currentUser) {
          alert('Please log in to add friends!');
          return;
        }
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        const friend = matches[index];
        await fetch('http://localhost:5001/api/friends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userId: currentUser.id, friendId: friend.id })
        });
        friends.push(friend);
        matches.splice(index, 1);
        renderMatches();
        renderFriends();
        renderFeeds();
      });
    });
    document.querySelectorAll('.view-profile-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        showProfile(matches[index]);
      });
    });
  }
}

function renderFriends() {
  const friendsSection = document.querySelector('.friends');
  friendsSection.innerHTML = '<h2>Your Friends</h2>';

  if (friends.length === 0) {
    friendsSection.innerHTML += '<p>No friends yet!</p>';
  } else {
    friends.forEach((friend, index) => {
      const friendDiv = document.createElement('div');
      friendDiv.className = 'friend';
      friendDiv.setAttribute('data-index', index);
      friendDiv.innerHTML = `
        <p><strong>Username:</strong> ${friend.username}</p>
        <p><strong>Thought:</strong> ${friend.thought}</p>
        <p><strong>Tags:</strong> ${friend.tags}</p>
        <button class="view-profile-btn">View Profile</button>
        <button class="reply-btn">Chat</button>
      `;
      friendDiv.addEventListener('click', () => showProfile(friend));
      friendsSection.appendChild(friendDiv);
    });

    document.querySelectorAll('.friend .reply-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const friendDiv = this.closest('.friend');
        const index = friendDiv.getAttribute('data-index');
        showChat(friends[index]);
      });
    });
    document.querySelectorAll('.view-profile-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const friendDiv = this.closest('.friend');
        const index = friendDiv.getAttribute('data-index');
        showProfile(friends[index]);
      });
    });
  }
}

function renderCommonFeed() {
  const commonFeed = document.getElementById('common-feed-content');
  const toggleType = document.querySelector('.toggle-btn.active')?.getAttribute('data-type') || 'posts';
  commonFeed.innerHTML = '';

  let feedItems = toggleType === 'posts' ? [...posts] : [...thoughts];

  feedItems.forEach((item, index) => {
    renderPost(item, index, commonFeed);
  });
}

function renderWeirdFeed() {
  const weirdFeed = document.getElementById('feed');
  weirdFeed.innerHTML = '';

  let feedItems = [...posts, ...thoughts];

  feedItems.forEach((item, index) => {
    renderPost(item, index, weirdFeed);
  });
}

function renderPost(post, index, container) {
  const postDiv = document.createElement('div');
  postDiv.className = 'post';
  postDiv.setAttribute('data-index', index);
  postDiv.innerHTML = `
    <p><strong>${post.userId ? profiles.find(p => p.id === post.userId)?.username || 'Anonymous' : 'Anonymous'} - ${post.timestamp}</strong></p>
    <p>${post.content}</p>
    <p><strong>Tags:</strong> ${post.tags || 'None'}</p>
    <p>Likes: <span class="like-count">${post.likes}</span> | Comments: <span class="comment-count">${post.comments.length}</span></p>
    <button class="like-btn">Like</button>
    <button class="view-profile-btn">View Profile</button>
    <button class="friend-btn">Add Friend</button>
    <div class="comment-section"></div>
    <form class="comment-form">
      <input type="text" placeholder="Add a comment..." maxlength="100">
      <button type="submit">Post</button>
    </form>
  `;
  container.appendChild(postDiv);

  const commentSection = postDiv.querySelector('.comment-section');
  post.comments.forEach((comment, commentIndex) => {
    renderComment(comment, index, [commentIndex], commentSection);
  });

  postDiv.querySelector('.like-btn').addEventListener('click', async () => {
    if (!currentUser) {
      alert('Please log in to like posts!');
      return;
    }
    post.likes++;
    postDiv.querySelector('.like-count').textContent = post.likes;
    await fetch(`http://localhost:5001/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ likes: post.likes })
    });
  });

  postDiv.querySelector('.view-profile-btn').addEventListener('click', () => {
    const profile = profiles.find(p => p.id === post.userId) || { username: 'Anonymous', thought: '', tags: '', match: 0, likes: 0, comments: 0, bio: 'No bio available.', avatar: 'https://via.placeholder.com/80/cccccc/ffffff?text=Anon' };
    showProfile(profile);
  });

  postDiv.querySelector('.friend-btn').addEventListener('click', async () => {
    if (!currentUser) {
      alert('Please log in to add friends!');
      return;
    }
    if (post.userId === currentUser.id) {
      alert(`Cannot add yourself as a friend!`);
      return;
    }
    const profile = profiles.find(p => p.id === post.userId);
    if (profile && !friends.some(f => f.id === profile.id)) {
      await fetch('http://localhost:5001/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: currentUser.id, friendId: profile.id })
      });
      friends.push(profile);
      renderFriends();
      alert(`${profile.username} added as a friend!`);
    } else {
      alert(`${profile?.username || 'Anonymous'} is already your friend or anonymous!`);
    }
  });

  postDiv.querySelector('.comment-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentUser) {
      alert('Please log in to comment!');
      return;
    }
    const input = postDiv.querySelector('.comment-form input');
    if (input.value.trim()) {
      const timestamp = new Date().toLocaleTimeString();
      const newComment = { id: post.comments.length + 1, userId: currentUser.id, content: input.value, timestamp, replies: [] };
      post.comments.push(newComment);
      await fetch(`http://localhost:5001/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ comments: post.comments })
      });
      renderFeeds();
      input.value = '';
    }
  });
}

function renderComment(comment, postIndex, commentPath, container) {
  const commentDiv = document.createElement('div');
  commentDiv.className = 'comment';
  commentDiv.style.marginLeft = '0';
  const username = profiles.find(p => p.id === comment.userId)?.username || 'Anonymous';
  commentDiv.innerHTML = `
    <p><strong>${username}</strong> ${comment.content} <span>${comment.timestamp}</span></p>
    <button class="reply-btn">Reply</button>
  `;
  container.appendChild(commentDiv);

  const repliesContainer = document.createElement('div');
  commentDiv.appendChild(repliesContainer);

  comment.replies.forEach((reply, replyIndex) => {
    renderComment(reply, postIndex, [...commentPath, replyIndex], repliesContainer);
  });

  const replyForm = document.createElement('form');
  replyForm.className = 'reply-form';
  replyForm.style.display = 'none';
  replyForm.innerHTML = `
    <input type="text" placeholder="Reply..." maxlength="100">
    <button type="submit">Post</button>
  `;
  commentDiv.appendChild(replyForm);

  commentDiv.querySelector('.reply-btn').addEventListener('click', () => {
    replyForm.style.display = replyForm.style.display === 'none' ? 'flex' : 'none';
  });

  replyForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentUser) {
      alert('Please log in to reply!');
      return;
    }
    const input = replyForm.querySelector('input');
    if (input.value.trim()) {
      const timestamp = new Date().toLocaleTimeString();
      const newReply = { id: comment.replies.length + 1, userId: currentUser.id, content: input.value, timestamp, replies: [] };
      let currentLevel = posts[postIndex].comments;
      commentPath.forEach(idx => {
        currentLevel = currentLevel[idx].replies;
      });
      currentLevel.push(newReply);
      await fetch(`http://localhost:5001/api/posts/${posts[postIndex].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ comments: posts[postIndex].comments })
      });
      renderFeeds();
      input.value = '';
      replyForm.style.display = 'none';
    }
  });
}

function renderFeeds() {
  renderWeirdFeed();
  renderCommonFeed();
}

function showProfile(profile) {
  console.log('showProfile called with profile:', profile); // Debug log to trace calls
  if (!profile) {
    console.error('No profile provided to showProfile');
    return;
  }
  document.getElementById('profile-username').textContent = profile.username || 'Unknown';
  document.getElementById('profile-thought').textContent = profile.thought || '';
  document.getElementById('profile-tags').textContent = profile.tags || 'None';
  document.getElementById('profile-match').textContent = profile.match || 0;
  document.getElementById('profile-likes').textContent = profile.likes || 0;
  document.getElementById('profile-comments').textContent = profile.comments || 0;
  document.getElementById('profile-bio').textContent = profile.bio || 'No bio available.';
  document.getElementById('profile-avatar').src = profile.avatar || 'https://via.placeholder.com/80/cccccc/ffffff?text=User';
  document.querySelector('.profile-popup').style.display = 'flex';

  document.getElementById('edit-profile').addEventListener('click', () => {
    alert('Edit profile feature coming soon!');
  });
}

async function showChat(contact) {
  if (!currentUser) {
    alert('Please log in to chat!');
    return;
  }
  switchSection('chat-section');
  const chatList = document.getElementById('chat-list');
  const chatForm = document.getElementById('chat-form');
  const typingIndicator = document.getElementById('typing-indicator');
  const clearChatBtn = document.getElementById('clear-chat');
  const emojiBtn = document.getElementById('emoji-btn');
  const emojiPickerContainer = document.querySelector('.emoji-picker-container');
  const emojiPicker = document.querySelector('emoji-picker');
  const chatInput = document.getElementById('chat-input');
  const fileInput = document.getElementById('file-input');
  const backBtn = document.querySelector('.back-btn');
  const contactKey = `${currentUser.id}-${contact.id}`;

  const response = await fetch(`http://localhost:5001/api/messages/${currentUser.id}/${contact.id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  chatHistories[contactKey] = await response.json() || [];

  document.querySelector('.chat-header h2').textContent = `Chat with ${contact.username}`;

  chatForm.style.display = 'block';
  replyingToMessage = null;

  function renderChatMessages() {
    const newMessages = chatHistories[contactKey].slice(chatList.children.length - 1);
    newMessages.forEach((msg, index) => {
      if (index === 0 && chatList.children.length === 1 && chatList.children[0].tagName === 'P') {
        chatList.innerHTML = '';
      }
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${msg.userId === currentUser.id ? 'sent' : 'received'} ${msg.replyTo ? 'reply' : ''}`;
      msgDiv.setAttribute('data-index', chatList.children.length);
      let statusIndicator = msg.userId === currentUser.id ? '<span class="status-indicator">Sent</span>' : '';
      let replyContent = '';
      if (msg.replyTo) {
        const repliedMsg = chatHistories[contactKey][msg.replyTo - 1];
        replyContent = `<div class="reply-to">${repliedMsg.userId === currentUser.id ? 'You' : contact.username}: ${repliedMsg.message || '[File]'}</div>`;
      }
      let filePreview = '';
      if (msg.file) {
        filePreview = `<div class="file-preview"><img src="${msg.file}" alt="Attachment" /><a href="${msg.file}" download>Download</a></div>`;
      }
      const avatarSrc = msg.userId === currentUser.id ? currentUser.avatar : contact.avatar;
      msgDiv.innerHTML = `
        <img src="${avatarSrc}" alt="Avatar" class="message-avatar">
        <div class="message-body">
          ${replyContent}
          <div class="message-content">${msg.message ? parseEmojis(msg.message) : '[File]'}</div>
          ${filePreview}
          <div class="message-meta"><span>${msg.timestamp}</span>${statusIndicator}</div>
        </div>
      `;
      chatList.appendChild(msgDiv);
    });
    chatList.scrollTop = chatList.scrollHeight;
  }

  renderChatMessages();

  chatInput.addEventListener('input', () => {
    if (!isTyping) {
      isTyping = true;
      setTimeout(() => { isTyping = false; }, 2000);
    }
  });

  let typingTimeout;
  function simulateRecipientTyping() {
    typingIndicator.classList.add('active');
    typingIndicator.textContent = `${contact.username} is typing...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingIndicator.classList.remove('active');
    }, 1500);
  }

  chatForm.onsubmit = async function(e) {
    e.preventDefault();
    let messageSent = false;
    const timestamp = new Date().toLocaleTimeString();

    if (chatInput.value.trim()) {
      const response = await fetch('http://localhost:5001/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: currentUser.id, contactId: contact.id, message: chatInput.value })
      });
      const newMessage = await response.json();
      chatHistories[contactKey].push(newMessage);
      messageSent = true;
      chatInput.value = '';
    }

    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = async function(e) {
        const response = await fetch('http://localhost:5001/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userId: currentUser.id, contactId: contact.id, file: e.target.result })
        });
        const newMessage = await response.json();
        chatHistories[contactKey].push(newMessage);
        renderChatMessages();
        fileInput.value = '';
      };
      reader.readAsDataURL(file);
      messageSent = true;
    }

    if (messageSent) {
      replyingToMessage = null;
      chatInput.placeholder = 'Type a message... (Use :emoji: or click 😊)';
      renderChatMessages();

      simulateRecipientTyping();
      setTimeout(async () => {
        const replyResponse = await fetch('http://localhost:5001/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userId: contact.id, contactId: currentUser.id, message: '😊 That’s weirdly cool!', replyTo: chatHistories[contactKey].length })
        });
        const replyMessage = await replyResponse.json();
        chatHistories[contactKey].push(replyMessage);
        renderChatMessages();
      }, 2000);
    }
  };

  clearChatBtn.onclick = function() {
    chatHistories[contactKey] = [];
    chatList.innerHTML = `<p>Select a match or friend to chat!</p>`;
    typingIndicator.classList.remove('active');
    replyingToMessage = null;
    chatInput.placeholder = 'Type a message... (Use :emoji: or click 😊)';
  };

  backBtn.addEventListener('click', () => {
    switchSection('matches');
    replyingToMessage = null;
    chatInput.placeholder = 'Type a message... (Use :emoji: or click 😊)';
  });

  emojiBtn.addEventListener('click', () => {
    emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
  });

  if (!emojiPicker) {
    console.error('Emoji picker not found in DOM');
    return;
  }

  emojiPicker.addEventListener('emoji-select', (event) => {
    const emoji = event.detail.emoji;
    chatInput.value += emoji.native || `:${emoji.id}:`;
    emojiPickerContainer.style.display = 'none';
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = '20px';
    chatInput.style.height = `${chatInput.scrollHeight}px`;
    if (chatInput.scrollHeight > 100) chatInput.style.height = '100px';
  });

  function parseEmojis(text) {
    const emojiRegex = /:([^:\s]+):/g;
    return text.replace(emojiRegex, (match, name) => {
      const emojiData = window.EmojiMartData.emojis[name]?.skins[0];
      return emojiData?.native || match;
    });
  }

  chatList.scrollTop = chatList.scrollHeight;
}

document.getElementById('post-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!currentUser) {
    alert('Please log in to post!');
    return;
  }
  const input = document.getElementById('post-input').value;
  const isAnon = document.getElementById('anon-check').checked;
  const userId = isAnon ? null : currentUser.id;

  if (input.trim()) {
    const timestamp = 'Just now';
    const type = document.getElementById('post-btn').classList.contains('active') ? 'post' : 'thought';
    const response = await fetch('http://localhost:5001/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ userId, content: input, timestamp, type, tags: `#weird${Math.random() > 0.5 ? 'pets' : 'weather'}` })
    });
    const newPost = await response.json();
    if (type === 'post') posts.unshift(newPost);
    else thoughts.unshift(newPost);
    document.getElementById('post-input').value = '';
    renderFeeds();
  }
});

document.getElementById('post-btn').addEventListener('click', function() {
  document.getElementById('post-btn').classList.add('active');
  document.getElementById('thought-btn').classList.remove('active');
});

document.getElementById('thought-btn').addEventListener('click', function() {
  document.getElementById('thought-btn').classList.add('active');
  document.getElementById('post-btn').classList.remove('active');
});

document.getElementById('post-btn').classList.add('active');

document.getElementById('search-btn').addEventListener('click', () => {
  const searchQuery = document.getElementById('username-search').value;
  renderCards(searchQuery, 'all', 'none');
});

document.getElementById('username-search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const searchQuery = document.getElementById('username-search').value;
    renderCards(searchQuery, 'all', 'none');
  }
});

function switchSection(sectionId) {
  document.querySelectorAll('section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(sectionId).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-section') === sectionId) {
      item.classList.add('active');
    }
  });
  if (sectionId === 'common-feed') renderCommonFeed();
  else if (sectionId === 'weird-feed') renderWeirdFeed();
  else if (sectionId === 'matches') renderMatches();
  else if (sectionId === 'friends') renderFriends();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    switchSection(item.getAttribute('data-section'));
  });
});

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    renderCommonFeed();
  });
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  document.body.classList.toggle('light-mode');
  const isDark = document.body.classList.contains('dark-mode');
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.classList.toggle('light', !isDark);
  themeToggle.classList.toggle('dark', isDark);
  themeToggle.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
});

document.querySelectorAll('.profile-popup .close-btn, .auth-popup .close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.profile-popup').style.display = 'none';
    document.getElementById('login-popup').style.display = 'none';
    document.getElementById('register-popup').style.display = 'none';
  });
});

// Authentication handling
const loginPopup = document.getElementById('login-popup');
const registerPopup = document.getElementById('register-popup');
const authBtn = document.getElementById('auth-btn');
const authText = document.getElementById('auth-text');

authBtn.addEventListener('click', () => {
  if (currentUser) {
    // Logout
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    authText.textContent = 'Login';
    alert('Logged out successfully!');
  } else {
    loginPopup.style.display = 'flex';
  }
});

document.getElementById('show-register').addEventListener('click', (e) => {
  e.preventDefault();
  loginPopup.style.display = 'none';
  registerPopup.style.display = 'flex';
});

document.getElementById('show-login').addEventListener('click', (e) => {
  e.preventDefault();
  registerPopup.style.display = 'none';
  loginPopup.style.display = 'flex';
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch('http://localhost:5001/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (response.ok) {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      authText.textContent = 'Logout';
      loginPopup.style.display = 'none';
      alert('Logged in successfully!');
      fetchInitialData(); // Refresh data
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('An error occurred during login.');
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const thought = document.getElementById('register-thought').value;
  const tags = document.getElementById('register-tags').value;
  const bio = document.getElementById('register-bio').value;

  try {
    const response = await fetch('http://localhost:5001/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, thought, tags, bio })
    });
    const data = await response.json();
    if (response.ok) {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      authText.textContent = 'Logout';
      registerPopup.style.display = 'none';
      alert('Registered and logged in successfully!');
      fetchInitialData(); // Refresh data
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Register error:', error);
    alert('An error occurred during registration.');
  }
});

// Initialize the app
fetchInitialData();
switchSection('match-feed');

// Ensure the profile popup is hidden on page load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.profile-popup').style.display = 'none';
});