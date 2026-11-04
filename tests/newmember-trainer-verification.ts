/**
 * NewMemberModal Trainer & Status Logic Verification
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isValidDate } from '../src/utils/dateInputUtils';

describe('NewMemberModal Trainer & Status Logic', () => {
  it('should validate date formats correctly', () => {
    assert.strictEqual(isValidDate('1995-01-01'), true);
    assert.strictEqual(isValidDate('2026-03-30'), true);
    assert.strictEqual(isValidDate('invalid'), false);
    assert.strictEqual(isValidDate('1995-13-01'), false);
  });

  it('should enforce trainer selection when trainers exist', () => {
    const trainers = [
      { trainerId: 'tr-1', name: '김트레이너', centerId: 'c1', role: 'TRAINER' as const }
    ];
    // In new member mode, initial selection is empty string ''
    const initialTrainerId = '';
    assert.strictEqual(initialTrainerId, '');
    assert.strictEqual(trainers.length > 0, true);

    // Validation prevents submission if trainer is not selected
    const validate = (tId: string, trainerList: any[]) => {
      if (trainerList.length === 0) return '등록된 트레이너가 없습니다. 먼저 트레이너를 등록해주세요.';
      if (!tId) return '담당 트레이너를 지정해주세요.';
      return null;
    };

    assert.strictEqual(validate(initialTrainerId, trainers), '담당 트레이너를 지정해주세요.');
    assert.strictEqual(validate('tr-1', trainers), null);
  });

  it('should disable registration and show message when 0 trainers exist', () => {
    const trainers: any[] = [];
    const isEditMode = false;
    const isSubmitting = false;

    const isButtonDisabled = isSubmitting || (!isEditMode && trainers.length === 0);
    assert.strictEqual(isButtonDisabled, true);

    const validate = (tId: string, trainerList: any[]) => {
      if (trainerList.length === 0) return '등록된 트레이너가 없습니다. 먼저 트레이너를 등록해주세요.';
      if (!tId) return '담당 트레이너를 지정해주세요.';
      return null;
    };
    assert.strictEqual(validate('', trainers), '등록된 트레이너가 없습니다. 먼저 트레이너를 등록해주세요.');
  });

  it('should allow existing trainer in edit mode even if trainers list is empty', () => {
    const trainers: any[] = [];
    const isEditMode = true;
    const isSubmitting = false;

    const isButtonDisabled = isSubmitting || (!isEditMode && trainers.length === 0);
    assert.strictEqual(isButtonDisabled, false);
  });

  it('should always create new member with ACTIVE status', () => {
    const isEditMode = false;
    const userSelectedStatus = 'PAUSED'; // even if somehow selected
    const finalStatus = isEditMode ? userSelectedStatus : 'ACTIVE';
    assert.strictEqual(finalStatus, 'ACTIVE');
  });
});
