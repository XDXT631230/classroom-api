// Vercel Serverless API - 课堂管理系统后端
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// CORS 配置
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 简单的密码验证（实际生产应使用 bcrypt）
function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

// Supabase 请求封装
async function supabaseRequest(table, method, data, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query || ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'POST') headers['Prefer'] = 'resolution=merge-duplicates';
  
  const options = { method, headers };
  if (data && method !== 'GET' && method !== 'DELETE') {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }
  if (method === 'DELETE' || response.status === 204) return null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return null;
}

module.exports = async (req, res) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.status(200).setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  // 设置 CORS
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  try {
    const { action, classId, password, data } = req.body || {};

    if (!classId || !password) {
      return res.status(400).json({ error: '需要班级ID和密码' });
    }

    const passwordHash = hashPassword(password);
    const fullClassId = `${classId}_${passwordHash}`;

    // 根据 action 执行不同操作
    switch (action) {
      case 'load': {
        // 加载数据
        const students = await supabaseRequest('students', 'GET', null, `?class_id=eq.${encodeURIComponent(fullClassId)}&select=*`);
        const records = await supabaseRequest('records', 'GET', null, `?class_id=eq.${encodeURIComponent(fullClassId)}&select=*&order=created_at.desc`);
        const shopItems = await supabaseRequest('shop_items', 'GET', null, `?class_id=eq.${encodeURIComponent(fullClassId)}&select=*`);
        const customBtns = await supabaseRequest('custom_buttons', 'GET', null, `?class_id=eq.${encodeURIComponent(fullClassId)}&select=*`);

        return res.status(200).json({
          success: true,
          students: students || [],
          records: records || [],
          shopItems: shopItems || [],
          customBtns: customBtns || []
        });
      }

      case 'save': {
        // 保存数据
        if (!data) {
          return res.status(400).json({ error: '需要数据' });
        }

        // 删除旧数据
        await supabaseRequest('students', 'DELETE', null, `?class_id=eq.${encodeURIComponent(fullClassId)}`);
        await supabaseRequest('records', 'DELETE', null, `?class_id=eq.${encodeURIComponent(fullClassId)}`);
        await supabaseRequest('shop_items', 'DELETE', null, `?class_id=eq.${encodeURIComponent(fullClassId)}`);
        await supabaseRequest('custom_buttons', 'DELETE', null, `?class_id=eq.${encodeURIComponent(fullClassId)}`);

        // 插入新数据
        if (data.students && data.students.length > 0) {
          const studentRows = data.students.map(name => ({
            class_id: fullClassId,
            name: name,
            score: data.scores?.[name] || 0
          }));
          await supabaseRequest('students', 'POST', studentRows);
        }

        if (data.records && data.records.length > 0) {
          const recordRows = data.records.map(r => ({
            class_id: fullClassId,
            ...r
          }));
          await supabaseRequest('records', 'POST', recordRows);
        }

        if (data.shopItems && data.shopItems.length > 0) {
          const itemRows = data.shopItems.map(i => ({
            class_id: fullClassId,
            ...i
          }));
          await supabaseRequest('shop_items', 'POST', itemRows);
        }

        if (data.customBtns && data.customBtns.length > 0) {
          const btnRows = data.customBtns.map(b => ({
            class_id: fullClassId,
            ...b
          }));
          await supabaseRequest('custom_buttons', 'POST', btnRows);
        }

        return res.status(200).json({ success: true, message: '保存成功' });
      }

      default:
        return res.status(400).json({ error: '未知操作' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
