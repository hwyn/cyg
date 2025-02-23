let tableDb;
function openDB() {
  if (tableDb) return Promise.resolve(tableDb);
  const request = indexedDB.open('recordRootDatabase', 1);

  request.onupgradeneeded = function (event) {
    let db = event.target.result;
    let objectStore = db.createObjectStore('myStore', { keyPath: 'id' });
    objectStore.createIndex('name', 'name', { unique: false });
    console.log('对象存储创建完成');
  };

  return new Promise((resolve, reject) => {
    request.onsuccess = function (event) {
      resolve(tableDb = event.target.result);
      tableDb.addEventListener('close', () => tableDb = null);
      console.log('数据库打开成功');
    };

    request.onerror = function (event) {
      tableDb = null;
      reject(event.target.errorCode);
      console.error('数据库打开失败:', event.target.errorCode);
    };
  });
}

function factoryTable(table) {
  const empty = {};
  return function (db, e, handle) {
    const transaction = db.transaction([table], e);
    const request = handle(transaction.objectStore(table));
    return new Promise((resolve, reject) => {
      let value = empty;
      let complete;
      request.onsuccess = (event) => {
        value = event.target.result;
        if (complete) resolve(value);
      };
      transaction.oncomplete = () => {
        complete = true;
        if (value !== empty) resolve(value);
      }
      request.onerror = (event) => {
        tableDb = null;
        reject(event.target.error);
      }
    });
  }
}

const getObjectStore = factoryTable('myStore');
const add = (db, data) => getObjectStore(db, 'readwrite', (store) => store.add(data));
const remove = (db, id) => getObjectStore(db, 'readwrite', (store) => store.delete(id));
const update = (db, data) => getObjectStore(db, 'readwrite', (store) => store.put(data));
const queryById = (db, id) => getObjectStore(db, 'readonly', (store) => store.get(id));
const queryAll = (db) => getObjectStore(db, 'readonly', (store) => store.getAll());

const findData = (db) => queryById(db, 1).then((result) => {
  if (!result) return add(db, { id: 1, mapping: [] }).then(() => queryById(db, 1));
  return result;
});

function factoryRoute(url, { mapping }) {
  const responseOk = (data) => ({ code: data });

  function getList() {
    return mapping.map(({ name, date }) => ({ name, date }));
  }

  function get(name) {
    const item = mapping.find((item) => item.name === name);
    return item.list || [];
  }

  function push(pushList) {
    const defaultName = '操作录制';
    const index = mapping.reduceRight((i, item) => `${defaultName}${i}` === item.name ? i + 1 : i, 1);
    const name = index ? `${defaultName}${index}` : defaultName;
    const item = { name, date: Date.now(), list: pushList };
    mapping.unshift(item);
    return item;
  }

  function remove(body) {
    const indexOf = mapping.findIndex(({ name, date }) => body.name === name || body.date === date);
    if (indexOf !== -1) mapping.splice(indexOf, 1);
    return responseOk('ok');
  }

  function rename(name, body) {
    const indexOf = mapping.findIndex((item) => item.name === body.name && body.date === item.date);
    if (indexOf === -1) return responseOk('non-ok');
    mapping[indexOf].name = name;
    return responseOk('ok');
  }

  return function (body) {
    if ('/record/list' === url) return getList(body);
    if ('/record/push' === url) return push(body);
    if ('/record/delete' === url) return remove(body);
    if (url.indexOf('/record/rename') !== -1) return rename(url.replace(/\/record\/rename\//, ''), body);
    if (/^\/record\/[^\/]*/.test(url)) return get(url.replace(/\/record\//, ''), body);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { url, params } = request;
  // openDB().then((db) => db.deleteObjectStore('myStore'));
  // fetch('http://127.0.0.1:3001' + url, params).then((res) => res.json()).then((res) => sendResponse(res));
  openDB().then((db) => findData(db).then((data) => {
    const result = factoryRoute(url, data)(params.body ? JSON.parse(params.body) : params.body);
    return update(db, data).then(() => sendResponse(result));
  }));
  return true;
});