const posts = [
    { 
      id: 1, 
      userId: 1, 
      content: 'Just saw a cloud shaped like a middle finger.', 
      timestamp: '2m ago', 
      type: 'post', 
      likes: 0, 
      comments: [
        { id: 1, userId: 2, content: 'That’s epic!', timestamp: '1m ago', replies: [] }
      ], 
      tags: '#weirdweather #funny'
    }
  ];
  
  module.exports = { posts };