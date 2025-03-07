!function createWebRequestListener() {
  const type = '__record__listener__request__';
  const addMethodListener = (method, action) => {
    chrome.webRequest[method].addListener((details) => {
      if (details.tabId < 0) return;
      chrome.tabs.sendMessage(details.tabId, { type, data: { action, details } }, () => !!chrome.runtime.lastError);
    }, { urls: ["<all_urls>"] });
  }

  addMethodListener('onBeforeRequest', 'start');
  addMethodListener('onCompleted', 'end');
  addMethodListener('onErrorOccurred', 'error');
}();

const onMessage = function () {
  const receiveMap = new Map();

  chrome.runtime.onMessage.addListener(({ type, data }, sender, sendResponse) => {
    const receive = receiveMap.get(type);
    if (!receive) return;
    const { listener, isSync } = receive;
    const result = listener(data, sender);
    if (result.then) result.then((value) => sendResponse(value));
    else sendResponse(value);
    return !isSync;
  });

  return (type, listener, isSync = false) => receiveMap.set(type, { isSync, listener })
}();

const operatorDb = function () {
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

  return { openDB, add, remove, update, queryById, queryAll, findData }
}();

onMessage('__record_request_event__', function () {
  const responseOk = (data) => ({ code: data });

  function getList(mapping) {
    return mapping.map(({ name, date }) => ({ name, date }));
  }

  function get(name, mapping) {
    const item = mapping.find((item) => item.name === name);
    return item.list || [];
  }

  function push(pushList, mapping) {
    const defaultName = '操作录制';
    const index = mapping.reduceRight((i, item) => `${defaultName}${i}` === item.name ? i + 1 : i, 1);
    const name = index ? `${defaultName}${index}` : defaultName;
    const item = { name, date: Date.now(), list: pushList };
    mapping.unshift(item);
    return item;
  }

  function remove(body, mapping) {
    const indexOf = mapping.findIndex(({ name, date }) => body.name === name || body.date === date);
    if (indexOf !== -1) mapping.splice(indexOf, 1);
    return responseOk('ok');
  }

  function rename(name, body, mapping) {
    const indexOf = mapping.findIndex((item) => item.name === body.name && body.date === item.date);
    if (indexOf === -1) return responseOk('non-ok');
    mapping[indexOf].name = name;
    return responseOk('ok');
  }

  function app(url, body, { mapping }) {
    if ('/record/list' === url) return getList(mapping);
    if ('/record/push' === url) return push(body, mapping);
    if ('/record/delete' === url) return remove(body, mapping);
    if (url.indexOf('/record/rename') !== -1) return rename(url.replace(/\/record\/rename\//, ''), body, mapping);
    if (/^\/record\/[^\/]*/.test(url)) return get(url.replace(/\/record\//, ''), mapping);
  }

  return async ({ url, params, isAutomation }) => {
    if (!isAutomation) {
      const db = await operatorDb.openDB();
      const data = await operatorDb.findData(db);
      const result = app(url, params.body ? JSON.parse(params.body) : params.body, data);
      await operatorDb.update(db, data);
      return result;
    }
    return fetch('http://127.0.0.1:3001' + url, params).then((res) => res.json());
  }
}());

onMessage('__record__automation__info__', function () {
  const recordInfo = {};
  return async ({ action, data } = {}, sender) => {
    let info = recordInfo[sender.tab.id];
    switch (action) {
      case 'stop':
      case 'end': info = undefined; break;
      case 'start': info = { status: action, list: data }; break;
      case 'run': info = { status: action, ...data }; break;
      case 'push': info?.list.push(data); break;
      case 'unshift': info?.list.unshift(data); break;
      case 'splice': info?.list.splice(data[0], data[1]); break;
      case 'shift': info?.list.shift(); break;
    }
    recordInfo[sender.tab.id] = info;
    if (action === 'get') {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return info ?? { status: 0 };
    }
  }
}());
