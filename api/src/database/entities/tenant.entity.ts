import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import {User} from './user.entity'
import {Job} from './job.entity'
@Entity('tenants')
export class Tenant{
    @PrimaryGeneratedColumn('uuid')
    id:string

    @Column({length:255})
    name: string;

    @Column({length: 50, default:'free'})
    plan: string;

    @Column({default: true})
    isActive: boolean

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // Relations 
    @OneToMany(()=>User, user => user.tenant)
    users: User[];
    @OneToMany(()=>Job, job => job.tenant)
    jobs: Job[];
}
