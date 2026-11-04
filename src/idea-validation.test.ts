import { describe, expect, it } from 'vitest';
import { isTags, validateCreate, validatePatch } from './idea-validation';
describe('idea API input validation', () => {
  it('rejects malformed create requests', () => {
    expect(validateCreate(null)).toBeNull();
    expect(validateCreate({title:'   '})).toBeNull();
    expect(validateCreate({title:'A',status:'deleted'})).toBeNull();
    expect(validateCreate({title:'A',tags:[' bad ']})).toBeNull();
    expect(validateCreate({title:'A',description:42})).toBeNull();
  });
  it('applies safe defaults', () => {
    expect(validateCreate({title:' New idea '})).toEqual({title:'New idea',description:'',status:'inbox',priority:'medium',tags:[]});
  });
  it('accepts selected status and metadata', () => {
    expect(validateCreate({title:'X',status:'ready',priority:'high',tags:['work']})?.status).toBe('ready');
  });
  it('rejects unknown update fields', () => {
    expect(validatePatch({owner:'someone'})).toBeNull();
    expect(validatePatch({})).toBeNull();
    expect(validatePatch({status:'invalid'})).toBeNull();
  });
  it('normalizes update title', () => expect(validatePatch({title:' Updated '})?.title).toBe('Updated'));
  it('limits tags', () => expect(isTags(Array.from({length:21},(_,i)=>'tag'+i))).toBe(false));
});
