import { TestBed } from '@angular/core/testing';
import { NetworkService } from './network.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('NetworkService', () => {
  let service: NetworkService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [NetworkService]
    });
    service = TestBed.inject(NetworkService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
