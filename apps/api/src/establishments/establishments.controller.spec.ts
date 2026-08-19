import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EstablishmentsController } from './establishments.controller';
import { EstablishmentsService } from './establishments.service';

describe('EstablishmentsController', () => {
  let controller: EstablishmentsController;
  const mockService = { getPublicBySlug: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EstablishmentsController],
      providers: [{ provide: EstablishmentsService, useValue: mockService }],
    }).compile();
    controller = module.get(EstablishmentsController);
  });

  it('throws 404 when the establishment is not found', async () => {
    mockService.getPublicBySlug.mockResolvedValue(null);
    await expect(controller.getBySlug('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns the DTO when found', async () => {
    const dto = { slug: 'golden-oven-nablus' } as any;
    mockService.getPublicBySlug.mockResolvedValue(dto);
    expect(await controller.getBySlug('golden-oven-nablus')).toBe(dto);
  });
});
