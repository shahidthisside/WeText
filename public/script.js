// Fake user data (for now, we'll simulate usernames in profiles for Wastext.com)
const profiles = [
  { username: "QuirkLord42", thought: "What if cats are alien spies?", tags: "#weirdpets #conspiracy", match: 89, likes: 5, comments: 2, bio: "Oddball pondering the universe.", avatar: "https://via.placeholder.com/80/8a4af3/ffffff?text=QL" },
  { username: "CloudLover", thought: "Clouds are just sky hugs.", tags: "#weirdweather #deepthoughts", match: 92, likes: 10, comments: 4, bio: "Sky enthusiast with quirky ideas.", avatar: "https://via.placeholder.com/80/4af38a/ffffff?text=CL" },
  { username: "ToastFan", thought: "Toast is bread flexing.", tags: "#foodthoughts #oddideas", match: 85, likes: 3, comments: 1, bio: "Bread lover with a twist.", avatar: "https://via.placeholder.com/80/f38a4a/ffffff?text=TF" }
];

let matches = [];
let friends = [];
let posts = [
  { 
    user: "QuirkLord42", 
    content: "Just saw a cloud shaped like a middle finger.", 
    timestamp: "2m ago", 
    type: "post", 
    likes: 0, 
    comments: [
      { user: "WeirdFan", content: "That’s epic!", timestamp: "1m ago", replies: [
        { user: "CloudLover", content: "Totally!", timestamp: "30s ago", replies: [
          { user: "QuirkLord42", content: "youuuu", timestamp: "12:58:38 AM", replies: [
            { user: "QuirkLord42", content: "boyyy", timestamp: "12:59:42 AM", replies: [
              { user: "QuirkLord42", content: "yes", timestamp: "12:59:30 AM", replies: [] }
            ]}
          ]}
        ]}
      ] }
    ], 
    tags: "#weirdweather #funny"
  }
];
let thoughts = [
  { 
    user: "Anonymous", 
    content: "What if cats are alien spies?", 
    timestamp: "recent", 
    type: "thought", 
    likes: 5, 
    comments: [],
    tags: "#weirdpets #conspiracy"
  }
];
let chatHistories = {};
let isTyping = false;
let replyingToMessage = null;

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

  // Apply filtering
  if (filter === 'tags') {
    filteredProfiles = filteredProfiles.filter(profile => profile.tags);
  } else if (filter === 'likes') {
    filteredProfiles = filteredProfiles.filter(profile => profile.likes > 0);
  } else if (filter === 'match') {
    filteredProfiles = filteredProfiles.filter(profile => profile.match >= 80);
  }

  // Apply sorting
  if (sort === 'match-desc') {
    filteredProfiles.sort((a, b) => b.match - a.match);
  } else if (sort === 'match-asc') {
    filteredProfiles.sort((a, b) => a.match - b.match);
  } else if (sort === 'username') {
    filteredProfiles.sort((a, b) => a.username.localeCompare(b.username));
  }

  // Show "No results" message if no matches
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
    btn.addEventListener('click', function() {
      const card = this.closest('.card');
      const index = card.getAttribute('data-index');
      matches.push(filteredProfiles[index]);
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
      alert('Match! Added to your matches.');
      renderMatches();
      renderFeeds();
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
    btn.addEventListener('click', function() {
      const card = this.closest('.card');
      const index = card.getAttribute('data-index');
      filteredProfiles[index].likes++;
      card.querySelector('.like-count').textContent = filteredProfiles[index].likes;
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

  // Reattach filter and sort event listeners
  document.getElementById('match-filter').value = filter;
  document.getElementById('match-sort').value = sort;
  document.getElementById('match-filter').addEventListener('change', (e) => {
    renderCards(searchQuery, e.target.value, document.getElementById('match-sort').value);
  });
  document.getElementById('match-sort').addEventListener('change', (e) => {
    renderCards(searchQuery, document.getElementById('match-filter').value, e.target.value);
  });

  // Reattach search event listeners
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
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
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
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        matches[index].likes++;
        matchDiv.querySelector('.like-count').textContent = matches[index].likes;
        renderFeeds();
      });
    });
    document.querySelectorAll('.friend-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const matchDiv = this.closest('.match');
        const index = matchDiv.getAttribute('data-index');
        friends.push(matches[index]);
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
    <p><strong>${post.user} - ${post.timestamp}</strong></p>
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

  postDiv.querySelector('.like-btn').addEventListener('click', () => {
    post.likes++;
    postDiv.querySelector('.like-count').textContent = post.likes;
  });

  postDiv.querySelector('.view-profile-btn').addEventListener('click', () => {
    const profile = profiles.find(p => p.username === post.user) || { username: post.user, thought: '', tags: '', match: 0, likes: 0, comments: 0, bio: 'No bio available.', avatar: "https://via.placeholder.com/80/cccccc/ffffff?text=Anon" };
    showProfile(profile);
  });

  postDiv.querySelector('.friend-btn').addEventListener('click', () => {
    if (post.user === 'Anonymous' || post.user === 'QuirkLord42') {
      alert(`Cannot add yourself or anonymous users as friends!`);
      return;
    }
    const profile = profiles.find(p => p.username === post.user) || { username: post.user, thought: post.content, tags: post.tags, match: 0, likes: post.likes, comments: post.comments.length, bio: 'No bio available.', avatar: "https://via.placeholder.com/80/cccccc/ffffff?text=Anon" };
    if (!friends.some(f => f.username === profile.username)) {
      friends.push(profile);
      renderFriends();
      alert(`${profile.username} added as a friend!`);
    } else {
      alert(`${profile.username} is already your friend!`);
    }
  });

  postDiv.querySelector('.comment-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const input = postDiv.querySelector('.comment-form input');
    if (input.value.trim()) {
      const timestamp = new Date().toLocaleTimeString();
      post.comments.push({ user: 'QuirkLord42', content: input.value, timestamp, replies: [] });
      renderFeeds();
      input.value = '';
    }
  });
}

function renderComment(comment, postIndex, commentPath, container) {
  const commentDiv = document.createElement('div');
  commentDiv.className = 'comment';
  commentDiv.style.marginLeft = '0'; // Explicitly set margin-left to 0 for all levels
  commentDiv.innerHTML = `
    <p><strong>${comment.user}</strong> ${comment.content} <span>${comment.timestamp}</span></p>
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

  replyForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const input = replyForm.querySelector('input');
    if (input.value.trim()) {
      const timestamp = new Date().toLocaleTimeString();
      const newReply = { user: 'QuirkLord42', content: input.value, timestamp, replies: [] };
      let currentLevel = posts[postIndex].comments;
      commentPath.forEach(idx => {
        currentLevel = currentLevel[idx].replies;
      });
      currentLevel.push(newReply);
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
  document.getElementById('profile-username').textContent = profile.username;
  document.getElementById('profile-thought').textContent = profile.thought;
  document.getElementById('profile-tags').textContent = profile.tags || 'None';
  document.getElementById('profile-match').textContent = profile.match;
  document.getElementById('profile-likes').textContent = profile.likes;
  document.getElementById('profile-comments').textContent = profile.comments;
  document.getElementById('profile-bio').textContent = profile.bio;
  document.getElementById('profile-avatar').src = profile.avatar;
  document.querySelector('.profile-popup').style.display = 'flex';

  document.getElementById('edit-profile').addEventListener('click', () => {
    alert('Edit profile feature coming soon!');
  });
}

function showChat(contact) {
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
  const contactKey = contact.thought;

  if (!chatHistories[contactKey]) {
    chatHistories[contactKey] = [{ sender: 'Them', message: `${contact.thought} (their last thought)`, timestamp: new Date().toLocaleTimeString(), status: 'read', readAt: null }];
  }

  // Update chat header with contact username
  document.querySelector('.chat-header h2').textContent = `Chat with ${contact.username}`;
  
  chatForm.style.display = 'block';
  replyingToMessage = null; // Reset replying state

  function renderChatMessages() {
    // Only append new messages instead of re-rendering the entire list
    const newMessages = chatHistories[contactKey].slice(chatList.children.length - 1);
    newMessages.forEach((msg, index) => {
      if (index === 0 && chatList.children.length === 1 && chatList.children[0].tagName === 'P') {
        chatList.innerHTML = ''; // Clear initial placeholder only if no messages yet
      }
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${msg.sender === 'You' ? 'sent' : 'received'} ${msg.replyTo ? 'reply' : ''}`;
      msgDiv.setAttribute('data-index', chatList.children.length);
      let statusIndicator = '';
      if (msg.sender === 'You') {
        if (msg.status === 'sent') statusIndicator = '<span class="status-indicator">Sent</span>';
        else if (msg.status === 'delivered') statusIndicator = '<span class="status-indicator">Delivered</span>';
        else if (msg.status === 'read' && msg.readAt) statusIndicator = `<span class="status-indicator">Read</span><span class="read-receipt"> Seen at ${new Date(msg.readAt).toLocaleTimeString()}</span>`;
      }
      let replyContent = '';
      if (msg.replyTo !== undefined && msg.replyTo !== null) {
        const repliedMsg = chatHistories[contactKey][msg.replyTo];
        replyContent = `<div class="reply-to">${repliedMsg.sender}: ${repliedMsg.message || '[File]'}</div>`;
      }
      let filePreview = '';
      if (msg.file) {
        filePreview = `<div class="file-preview"><img src="${msg.file}" alt="Attachment" /><a href="${msg.file}" download>Download</a></div>`;
      }
      const avatarSrc = msg.sender === 'You' ? profiles.find(p => p.username === 'QuirkLord42').avatar : contact.avatar;
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

  // Typing indicator logic for the user
  chatInput.addEventListener('input', () => {
    if (!isTyping) {
      isTyping = true;
      setTimeout(() => {
        isTyping = false;
      }, 2000);
    }
  });

  // Typing indicator for the recipient (simulated)
  let typingTimeout;
  function simulateRecipientTyping() {
    typingIndicator.classList.add('active');
    typingIndicator.textContent = `${contact.username} is typing...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingIndicator.classList.remove('active');
    }, 1500);
  }

  chatForm.onsubmit = function(e) {
    e.preventDefault();
    let messageSent = false;
    const timestamp = new Date().toLocaleTimeString();

    // Handle text message
    if (chatInput.value.trim()) {
      const msg = {
        sender: 'You',
        message: chatInput.value,
        timestamp,
        status: 'sent',
        readAt: null,
        replyTo: replyingToMessage
      };
      chatHistories[contactKey].push(msg);
      messageSent = true;
      chatInput.value = '';
    }

    // Handle file attachment
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        const msg = {
          sender: 'You',
          file: e.target.result,
          timestamp,
          status: 'sent',
          readAt: null,
          replyTo: replyingToMessage
        };
        chatHistories[contactKey].push(msg);
        renderChatMessages();
        fileInput.value = ''; // Clear file input
        handleMessageStatus(msg);
      };
      reader.readAsDataURL(file);
      messageSent = true;
    }

    if (messageSent) {
      replyingToMessage = null; // Reset replying state
      chatInput.placeholder = 'Type a message... (Use :emoji: or click 😊)';
      renderChatMessages();

      // Simulate message status updates
      const lastMsgIndex = chatHistories[contactKey].length - 1;
      const lastMsg = chatHistories[contactKey][lastMsgIndex];
      handleMessageStatus(lastMsg);

      // Simulate recipient typing and replying
      simulateRecipientTyping();
      setTimeout(() => {
        const replyTimestamp = new Date().toLocaleTimeString();
        const replyMsg = {
          sender: 'Them',
          message: '😊 That’s weirdly cool!',
          timestamp: replyTimestamp,
          status: 'read',
          readAt: new Date(),
          replyTo: lastMsgIndex
        };
        chatHistories[contactKey].push(replyMsg);
        renderChatMessages();
      }, 2000);
    }
  };

  function handleMessageStatus(msg) {
    setTimeout(() => {
      msg.status = 'delivered';
      renderChatMessages();
    }, 1000);

    setTimeout(() => {
      msg.status = 'read';
      msg.readAt = new Date();
      renderChatMessages();
    }, 3000);
  }

  clearChatBtn.onclick = function() {
    chatHistories[contactKey] = [];
    chatList.innerHTML = `<p>Select a match or friend to chat!</p>`;
    typingIndicator.classList.remove('active');
    replyingToMessage = null;
    chatInput.placeholder = 'Type a message... (Use :emoji: or click 😊)';
  };

  // Back button to return to sidebar
  backBtn.addEventListener('click', () => {
    switchSection('matches'); // Return to Matches section or sidebar default
    replyingToMessage = null;
    chatInput.placeholder = 'Type a message... (Use :emoji: or click 😊)';
  });

  // Emoji support
  emojiBtn.addEventListener('click', () => {
    emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
  });

  // Ensure emoji picker is initialized and handle selection
  if (!emojiPicker) {
    console.error('Emoji picker not found in DOM');
    return;
  }

  emojiPicker.addEventListener('emoji-select', (event) => {
    const emoji = event.detail.emoji;
    chatInput.value += emoji.native || `:${emoji.id}:`; // Add native emoji or shortcode
    emojiPickerContainer.style.display = 'none';
  });

  // Add Enter key support for sending messages
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // Auto-grow textarea on input
  chatInput.addEventListener('input', () => {
    chatInput.style.height = '20px';
    chatInput.style.height = `${chatInput.scrollHeight}px`;
    if (chatInput.scrollHeight > 100) chatInput.style.height = '100px';
  });

  // Parse emoji shortcodes on render
  function parseEmojis(text) {
    const emojiRegex = /:([^:\s]+):/g;
    return text.replace(emojiRegex, (match, name) => {
      const emojiData = window.EmojiMartData.emojis[name]?.skins[0];
      return emojiData?.native || match; // Use native emoji if available, otherwise keep shortcode
    });
  }

  chatList.scrollTop = chatList.scrollHeight;
}

document.getElementById('post-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const input = document.getElementById('post-input').value;
  const isAnon = document.getElementById('anon-check').checked;
  const username = isAnon ? 'Anonymous' : 'QuirkLord42';

  if (input.trim()) {
    const timestamp = 'Just now';
    const type = document.getElementById('post-btn').classList.contains('active') ? 'post' : 'thought';
    const newItem = { user: username, content: input, timestamp, type, likes: 0, comments: [], tags: `#weird${Math.random() > 0.5 ? 'pets' : 'weather'}` };

    if (type === 'post') {
      posts.unshift(newItem);
    } else {
      thoughts.unshift(newItem);
    }
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

// Initial state: Post button active
document.getElementById('post-btn').classList.add('active');

// Search functionality
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

// Theme Toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  document.body.classList.toggle('light-mode');
  const isDark = document.body.classList.contains('dark-mode');
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.classList.toggle('light', !isDark);
  themeToggle.classList.toggle('dark', isDark);
  themeToggle.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
});

renderCards('', 'all', 'none');
renderMatches();
renderFriends();
renderFeeds();
switchSection('match-feed');