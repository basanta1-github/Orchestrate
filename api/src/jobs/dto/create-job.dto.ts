import {IsString, IsInt, IsOptional, IsObject, Min,Max} from 'class-validator'
export class CreateJobDto{
    @IsString()
    jobType: string

    @IsObject()
    payload: Record<string, any>

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    priority?: number;
}