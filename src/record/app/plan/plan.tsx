import { useCallback, useEffect, useState } from 'react';

import { Action } from '../action';
import { inject } from '../../utility';
import * as classes from './plan.scss';
import { video, close, play, edit, remove, save } from '../../assets';

export function Plan(props: any) {
  const action = inject(Action);
  const [showDelete, setDelete] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [renameIndex, setIndex] = useState(-1);
  const [inputValue, setValue] = useState('');

  const deleteItem = useCallback((item: any) => {
    const sb = action.remove(item).subscribe((list) => setList(list));
    return () => sb.unsubscribe();
  }, []);

  const onEdit = useCallback((item: any, index: number) => {
    setIndex(index);
    setValue(item.name);
  }, []);

  const rename = useCallback((item: any, value: string) => {
    if (!value) return alert('name is require');
    setIndex(-1);
    setValue('');
    action.updateName(item, value).subscribe((list) => setList(list));
  }, []);

  useEffect(() => {
    const sb = action.getList().subscribe((result: any[]) => setList(result));
    return () => sb.unsubscribe();
  }, []);

  return <div className={classes.plan}>
    <div className={classes.title}>
      <img src={video} />
      <span>操作录制</span>
      <img className={classes.close} onClick={props?.onClose} src={close} />
    </div>
    <div className={classes.content}>
      <div>
        <button className={classes.create} onClick={props?.onRecord}>新建</button>
        <label className={classes.delete}><input type="checkbox" onChange={() => setDelete(!showDelete)} checked={showDelete} /><span>删除</span></label>
      </div>
      <table className={[classes.table, showDelete ? classes.delete : ''].join(' ')}>
        <thead>
          <tr>
            <th>名称</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map((item, index) => (
            <tr key={index.toString()}>
              <td>
                <div className={classes.name}>
                  {index === renameIndex ? <input type='text' onChange={(event) => setValue(event.target.value)} value={inputValue} /> : <span>{item.name}</span>}
                </div>
              </td>
              <td>
                <div className={classes.action}>
                  {index === renameIndex ?
                    <img src={save} onClick={() => rename(item, inputValue)} />
                    :
                    <>
                      <img src={play} onClick={() => props?.onRun(item)} />
                      <img src={edit} onClick={() => onEdit(item, index)} />
                      {showDelete ? <img src={remove} onClick={() => deleteItem(item)} /> : null}
                    </>
                  }
                </div>

              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
}
